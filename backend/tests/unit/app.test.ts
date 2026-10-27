// App behaviour with the databases and AI model replaced by mocks, so these tests run without Docker or a model.
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pingAnalyticsDatabase = vi.fn<() => Promise<boolean>>();
const pingAppDatabase = vi.fn<() => Promise<boolean>>();
vi.mock("../../src/config/database.js", () => ({ pingAnalyticsDatabase, pingAppDatabase }));
const checkModel = vi.fn<() => Promise<"up" | "down" | "model_missing" | "invalid_key">>();
vi.mock("../../src/ai/model.js", () => ({ checkModel, modelInfo: { provider: "ollama", model: "test-model" } }));

const { createApp } = await import("../../src/app.js");
const app = createApp();

describe("GET /api/v1/health", () => {
  beforeEach(() => {
    pingAnalyticsDatabase.mockResolvedValue(true);
    pingAppDatabase.mockResolvedValue(true);
    checkModel.mockResolvedValue("up");
  });

  it("returns 200 when both databases and the AI model are ready", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", checks: { appDatabase: "up", analyticsDatabase: "up", aiModel: "up" } });
    expect(res.body.ai).toEqual({ provider: "ollama", model: "test-model" });
  });

  it.each([
    ["analytics", pingAnalyticsDatabase, { appDatabase: "up", analyticsDatabase: "down" }],
    ["application", pingAppDatabase, { appDatabase: "down", analyticsDatabase: "up" }],
  ])("returns 503 when the %s database is down", async (_name, ping, checks) => {
    ping.mockResolvedValue(false);
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", checks });
  });

  it.each(["down", "model_missing", "invalid_key"] as const)("returns 503 when the AI model is %s", async (status) => {
    checkModel.mockResolvedValue(status);
    const res = await request(app).get("/api/v1/health");
    expect(res.status).toBe(503);
    expect(res.body.checks.aiModel).toBe(status);
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
