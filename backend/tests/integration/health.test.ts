// Requires the database: npm run db:up
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { closeDatabases } from "../../src/config/database.js";

afterAll(() => closeDatabases());

describe("GET /api/v1/health (real database)", () => {
  it("reports the analytics database as up", async () => {
    const res = await request(createApp()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.checks.analyticsDatabase).toBe("up");
  });
});
