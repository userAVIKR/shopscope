// The query pipeline with the AI replaced by a scripted fake, against the real database.
// Requires: npm run db:up && npm run db:seed
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlProposal } from "../../src/ai/sql-generator.js";
import { HttpError } from "../../src/utils/http-error.js";

const generateSql = vi.fn<() => Promise<SqlProposal>>();
const repairSql = vi.fn<(input: unknown, sql: string, problem: string) => Promise<SqlProposal>>();
vi.mock("../../src/ai/sql-generator.js", () => ({ generateSql, repairSql }));

const { createApp } = await import("../../src/app.js");
const { closeDatabases, prisma } = await import("../../src/config/database.js");
const { createTestUser, deleteTestUsers } = await import("../helpers/users.js");

const meta = { model: "fake-model", durationMs: 1 };
const ok = (sql: string, explanation = "Test query."): SqlProposal => ({ status: "ok", sql, explanation, ...meta });

const REVENUE_SQL =
  "SELECT ROUND(SUM(order_items.quantity * order_items.unit_price), 2) AS revenue FROM order_items JOIN orders ON orders.id = order_items.order_id WHERE orders.status <> 'cancelled'";
const BY_CATEGORY_SQL =
  "SELECT categories.name AS category, COUNT(*) AS products FROM products JOIN categories ON categories.id = products.category_id GROUP BY categories.name ORDER BY categories.name";

let app: ReturnType<typeof createApp>;
let user: Awaited<ReturnType<typeof createTestUser>>;

beforeAll(async () => {
  app = createApp();
  user = await createTestUser(app);
});
beforeEach(() => {
  generateSql.mockReset();
  repairSql.mockReset();
});
afterAll(async () => {
  await deleteTestUsers();
  await closeDatabases();
});

const ask = (question: string, cookie = user.cookie) =>
  request(app).post("/api/v1/queries").set("Cookie", cookie).send({ question });

describe("POST /queries", () => {
  it("answers a question: SQL, rows, chart and a history record", async () => {
    generateSql.mockResolvedValue(ok(REVENUE_SQL, "Total revenue excluding cancelled orders."));

    const res = await ask("What is our total revenue?");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "succeeded",
      summary: "Total revenue excluding cancelled orders.",
      sql: REVENUE_SQL,
      validation: { ok: true, issues: [] },
      repaired: false,
      error: null,
      result: {
        columns: [{ key: "revenue", label: "Revenue", type: "number" }],
        rows: [{ revenue: 18981675 }],
        rowCount: 1,
        truncated: false,
        visualization: { type: "metric", valueKey: "revenue" },
      },
    });

    const saved = await prisma.queryHistory.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(saved).toMatchObject({ userId: user.id, status: "SUCCEEDED", generatedSql: REVENUE_SQL, rowCount: 1 });
  });

  it("repairs SQL that fails validation, and validates the repair", async () => {
    generateSql.mockResolvedValue(ok("SELECT id FROM orders WHERE order_date > CURRENT_DATE"));
    repairSql.mockResolvedValue(ok(BY_CATEGORY_SQL));

    const res = await ask("Products per category");

    expect(res.body).toMatchObject({ status: "succeeded", repaired: true, sql: BY_CATEGORY_SQL });
    expect(repairSql.mock.calls[0]![2]).toContain("Use date literals");
    expect(res.body.result.visualization).toEqual({ type: "bar", xKey: "category", yKeys: ["products"] });
  });

  it("repairs SQL that fails when it runs", async () => {
    generateSql.mockResolvedValue(ok("SELECT 1 / 0 AS broken"));
    repairSql.mockResolvedValue(ok(REVENUE_SQL));

    const res = await ask("Revenue please");

    expect(res.body).toMatchObject({ status: "succeeded", repaired: true });
    expect(repairSql.mock.calls[0]![2]).toMatch(/division by zero/);
  });

  it("rejects unsafe SQL after one repair attempt and never runs it", async () => {
    generateSql.mockResolvedValue(ok("DELETE FROM orders"));
    repairSql.mockResolvedValue(ok("DROP TABLE orders"));

    const res = await ask("Delete everything");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "rejected", repaired: true, result: null, sql: "DROP TABLE orders" });
    expect(res.body.validation.issues[0].code).toBe("NOT_SELECT");
    expect(repairSql).toHaveBeenCalledTimes(1);
    expect(await prisma.queryHistory.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject({ status: "REJECTED" });
  });

  it("returns the model's explanation for questions the data cannot answer", async () => {
    generateSql.mockResolvedValue({ status: "cannot_answer", explanation: "No weather data.", ...meta });

    const res = await ask("Weather tomorrow?");

    expect(res.body).toMatchObject({ status: "unanswerable", summary: "No weather data.", sql: null, result: null });
    expect(repairSql).not.toHaveBeenCalled();
  });

  it("does not retry a timeout", async () => {
    generateSql.mockResolvedValue(
      ok("SELECT COUNT(*) AS n FROM order_items a JOIN order_items b ON true JOIN order_items c ON true"),
    );

    const res = await ask("Something huge");

    expect(res.body).toMatchObject({ status: "failed", error: { code: "QUERY_TIMEOUT" } });
    expect(repairSql).not.toHaveBeenCalled();
  }, 15_000);

  it("returns 503 when the model is unavailable, and records the failure", async () => {
    generateSql.mockRejectedValue(new HttpError(503, "MODEL_UNAVAILABLE", "The AI model is not reachable."));

    const res = await ask("Revenue?");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("MODEL_UNAVAILABLE");
    const failed = await prisma.queryHistory.findFirst({ where: { userId: user.id, errorCode: "MODEL_UNAVAILABLE" } });
    expect(failed?.status).toBe("FAILED");
  });

  it.each([
    ["too short", { question: "hi" }],
    ["too long", { question: "x".repeat(501) }],
    ["missing", {}],
  ])("rejects a question that is %s", async (_name, body) => {
    const res = await request(app).post("/api/v1/queries").set("Cookie", user.cookie).send(body);
    expect(res.status).toBe(400);
    expect(generateSql).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown dataset", async () => {
    const res = await request(app)
      .post("/api/v1/queries")
      .set("Cookie", user.cookie)
      .send({ question: "Revenue?", datasetId: "hr" });
    expect(res.status).toBe(404);
  });

  it("requires login", async () => {
    expect((await request(app).post("/api/v1/queries").send({ question: "Revenue?" })).status).toBe(401);
    expect(generateSql).not.toHaveBeenCalled();
  });
});

describe("history and reports", () => {
  const saveReport = (cookie: string, queryId: string, name: string, extra: object = {}) =>
    request(app).post("/api/v1/reports").set("Cookie", cookie).send({ queryId, name, ...extra });

  it("lists history newest first with pagination", async () => {
    const fresh = await createTestUser(app);
    generateSql.mockResolvedValue(ok(REVENUE_SQL));
    for (const q of ["first question", "second question", "third question"]) await ask(q, fresh.cookie);

    const page1 = await request(app).get("/api/v1/history?limit=2").set("Cookie", fresh.cookie);
    expect(page1.body.items.map((i: { question: string }) => i.question)).toEqual(["third question", "second question"]);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get(`/api/v1/history?limit=2&cursor=${page1.body.nextCursor}`)
      .set("Cookie", fresh.cookie);
    expect(page2.body.items.map((i: { question: string }) => i.question)).toEqual(["first question"]);
    expect(page2.body.nextCursor).toBeNull();
  });

  it("saves a successful query as a report and re-runs it", async () => {
    generateSql.mockResolvedValue(ok(BY_CATEGORY_SQL));
    const query = await ask("Products per category");

    const created = await saveReport(user.cookie, query.body.id, "Catalogue size");
    expect(created.status).toBe(201);
    expect(created.body.report).toMatchObject({ name: "Catalogue size", sql: BY_CATEGORY_SQL, datasetId: "sales" });

    const run = await request(app).post(`/api/v1/reports/${created.body.report.id}/run`).set("Cookie", user.cookie);
    expect(run.status).toBe(200);
    expect(run.body.result.rowCount).toBe(10);

    const listed = await request(app).get("/api/v1/reports").set("Cookie", user.cookie);
    expect(listed.body.reports.map((r: { id: string }) => r.id)).toContain(created.body.report.id);
  });

  it("will not save a rejected query as a report", async () => {
    generateSql.mockResolvedValue(ok("DELETE FROM orders"));
    repairSql.mockResolvedValue(ok("DELETE FROM orders"));
    const query = await ask("Delete things");

    expect((await saveReport(user.cookie, query.body.id, "Bad")).status).toBe(422);
  });

  it("ignores SQL sent by the client when saving a report", async () => {
    generateSql.mockResolvedValue(ok(BY_CATEGORY_SQL));
    const query = await ask("Products per category");

    const res = await saveReport(user.cookie, query.body.id, "Sneaky", { sql: "SELECT name FROM customers" });
    expect(res.body.report.sql).toBe(BY_CATEGORY_SQL);
  });

  it("re-validates stored SQL before running a report", async () => {
    generateSql.mockResolvedValue(ok(BY_CATEGORY_SQL));
    const query = await ask("Products per category");
    const created = await saveReport(user.cookie, query.body.id, "Tampered");
    // Simulate a tampered database row.
    await prisma.savedReport.update({ where: { id: created.body.report.id }, data: { sql: "DELETE FROM orders" } });

    const run = await request(app).post(`/api/v1/reports/${created.body.report.id}/run`).set("Cookie", user.cookie);
    expect(run.status).toBe(422);
    expect(run.body.error.code).toBe("SQL_REJECTED");
  });
});

describe("users cannot see or change each other's data", () => {
  it("history, reports and report runs return 404 for another user", async () => {
    const alice = await createTestUser(app, "Alice");
    const bob = await createTestUser(app, "Bob");
    generateSql.mockResolvedValue(ok(BY_CATEGORY_SQL));
    const query = await ask("A question from Alice", alice.cookie);
    const report = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", alice.cookie)
      .send({ queryId: query.body.id, name: "Report from Alice" });
    const reportId = report.body.report.id;

    const asBob = (method: "get" | "post" | "delete", path: string) => request(app)[method](path).set("Cookie", bob.cookie);
    expect((await asBob("get", `/api/v1/history/${query.body.id}`)).status).toBe(404);
    expect((await asBob("get", `/api/v1/reports/${reportId}`)).status).toBe(404);
    expect((await asBob("post", `/api/v1/reports/${reportId}/run`)).status).toBe(404);
    expect((await asBob("delete", `/api/v1/reports/${reportId}`)).status).toBe(404);
    const stolen = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", bob.cookie)
      .send({ queryId: query.body.id, name: "Stolen" });
    expect(stolen.status).toBe(404);

    expect((await asBob("get", "/api/v1/history")).body.items).toEqual([]);
    expect((await asBob("get", "/api/v1/reports")).body.reports).toEqual([]);

    // Alice still has everything, and can delete her own report.
    expect((await request(app).get(`/api/v1/reports/${reportId}`).set("Cookie", alice.cookie)).status).toBe(200);
    expect((await request(app).delete(`/api/v1/reports/${reportId}`).set("Cookie", alice.cookie)).status).toBe(204);
  });

  it("rejects malformed ids with 400", async () => {
    expect((await request(app).get("/api/v1/history/not-a-uuid").set("Cookie", user.cookie)).status).toBe(400);
  });
});

describe("datasets", () => {
  it("lists datasets and returns the schema without sensitive columns", async () => {
    const list = await request(app).get("/api/v1/datasets").set("Cookie", user.cookie);
    expect(list.body.datasets).toEqual([expect.objectContaining({ id: "sales" })]);

    const schema = await request(app).get("/api/v1/datasets/sales/schema").set("Cookie", user.cookie);
    const customers = schema.body.schema.tables.find((t: { name: string }) => t.name === "customers");
    expect(customers.columns.map((c: { name: string }) => c.name)).not.toContain("name");
    expect(schema.body.schema.metrics.map((m: { id: string }) => m.id)).toContain("revenue");
  });

  it("returns 404 for an unknown dataset schema", async () => {
    expect((await request(app).get("/api/v1/datasets/hr/schema").set("Cookie", user.cookie)).status).toBe(404);
  });

  it("requires login", async () => {
    expect((await request(app).get("/api/v1/datasets")).status).toBe(401);
  });
});
