// Requires the seeded database: npm run db:up && npm run db:seed
// These call the executor directly, skipping validation, to prove its own limits hold.
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabases } from "../../src/config/database.js";
import { executeReadOnly } from "../../src/sql/sql-executor.js";

afterAll(() => closeDatabases());

describe("executeReadOnly", () => {
  it("returns rows and column metadata", async () => {
    const result = await executeReadOnly("SELECT COUNT(*) AS orders, MIN(order_date) AS first FROM orders");
    expect(result.fields.map((f) => f.name)).toEqual(["orders", "first"]);
    expect(result.rows).toEqual([["5000", "2024-10-01"]]);
    expect(result.truncated).toBe(false);
  });

  it("caps the number of rows and reports truncation", async () => {
    const result = await executeReadOnly("SELECT id FROM order_items ORDER BY id", { maxRows: 100 });
    expect(result.rows).toHaveLength(100);
    expect(result.truncated).toBe(true);
    expect(result.rows[0]).toEqual([1]);
  });

  it("keeps the query's ORDER BY", async () => {
    const result = await executeReadOnly("SELECT id FROM orders ORDER BY id DESC", { maxRows: 3 });
    expect(result.rows).toEqual([[5000], [4999], [4998]]);
  });

  it("stops slow queries at the timeout", async () => {
    const started = Date.now();
    await expect(executeReadOnly("SELECT pg_sleep(5)", { timeoutMs: 300 })).rejects.toMatchObject({ code: "QUERY_TIMEOUT" });
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("refuses to read a sensitive column even without validation", async () => {
    await expect(executeReadOnly("SELECT name FROM customers")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("refuses a write hidden in a CTE even without validation", async () => {
    await expect(executeReadOnly("WITH x AS (DELETE FROM orders RETURNING id) SELECT id FROM x")).rejects.toThrow();
    expect((await executeReadOnly("SELECT COUNT(*) AS n FROM orders")).rows).toEqual([["5000"]]);
  });

  it("cannot escape the wrapping query to run a second statement", async () => {
    await expect(executeReadOnly("SELECT 1) AS x; DELETE FROM orders; SELECT (1")).rejects.toMatchObject({
      code: "QUERY_FAILED",
      message: expect.stringContaining("multiple commands"),
    });
    expect((await executeReadOnly("SELECT COUNT(*) AS n FROM orders")).rows).toEqual([["5000"]]);
  });

  it("returns the database's message for broken SQL, so the model can repair it", async () => {
    await expect(executeReadOnly("SELECT missing_column FROM orders")).rejects.toMatchObject({
      code: "QUERY_FAILED",
      message: expect.stringContaining("missing_column"),
    });
  });
});
