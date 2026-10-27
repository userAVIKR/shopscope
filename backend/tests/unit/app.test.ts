// App behaviour with the database replaced by a mock, so these tests run without Docker.
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pingAnalyticsDatabase = vi.fn<() => Promise<boolean>>();
vi.mock("../../src/config/database.js", () => ({ pingAnalyticsDatabase }));

const { createApp } = await import("../../src/app.js");
const app = createApp();

describe("GET /api/v1/health", () => {
  beforeEach(() => pingAnalyticsDatabase.mockReset());

  it("returns 200 when the database is reachable", async () => {
    pingAnalyticsDatabase.mockResolvedValue(true);
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", checks: { analyticsDatabase: "up" } });
  });

  it("returns 503 when the database is down", async () => {
    pingAnalyticsDatabase.mockResolvedValue(false);
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", checks: { analyticsDatabase: "down" } });
  });
});

describe("error handling", () => {
  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await request(app).post("/api/v1/health").set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });

  it("returns 413 for oversized bodies", async () => {
    const res = await request(app).post("/api/v1/health").send({ text: "x".repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("does not reveal the framework", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("CORS", () => {
  it("allows the frontend origin with credentials", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not allow other origins", async () => {
    const res = await request(app).get("/api/v1/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
  });
});
