// Requires the seeded database: npm run db:up && npm run db:seed
import { afterAll, describe, expect, it } from "vitest";
import { getMetric, METRICS } from "../../src/analytics/metrics.js";
import {
  DEFAULT_DATASET_ID,
  getDataCoverage,
  getDataset,
  verifySchemaAgainstDatabase,
} from "../../src/analytics/schema.service.js";
import { analyticsPool, closeDatabases } from "../../src/config/database.js";

afterAll(() => closeDatabases());

// Values produced by the deterministic seed (database/seed.ts).
const EXPECTED = { revenue: 18_981_675, order_count: 4_594 };

async function runMetric(id: string): Promise<number> {
  const metric = getMetric(id)!;
  const { rows } = await analyticsPool.query<{ value: string }>(
    `SELECT ${metric.expression} AS value
     FROM orders JOIN order_items ON order_items.order_id = orders.id
     WHERE ${metric.filter}`,
  );
  return Number(rows[0]!.value);
}

describe("schema definitions vs real database", () => {
  it("match exactly: every approved column exists with the right type", async () => {
    expect(await verifySchemaAgainstDatabase(analyticsPool, DEFAULT_DATASET_ID)).toEqual([]);
  });

  it("are enforced by the database: the reader can read exactly the approved columns", async () => {
    for (const table of getDataset(DEFAULT_DATASET_ID).tables) {
      for (const column of table.columns) {
        const { rows } = await analyticsPool.query<{ allowed: boolean }>(
          "SELECT has_column_privilege(current_user, $1, $2, 'SELECT') AS allowed",
          [table.name, column.name],
        );
        expect(rows[0]!.allowed, `${table.name}.${column.name}`).toBe(!column.sensitive);
      }
    }
    await expect(analyticsPool.query("SELECT name FROM customers LIMIT 1")).rejects.toThrow(/permission denied/);
  });

  it("report the date range of the seeded orders", async () => {
    expect(await getDataCoverage(analyticsPool)).toEqual({ from: "2024-10-01", to: "2026-09-30" });
  });
});

describe("metric definitions", () => {
  it.each(METRICS.map((m) => m.id))("%s runs as the read-only reader", async (id) => {
    expect(Number.isFinite(await runMetric(id))).toBe(true);
  });

  it("revenue matches the seed and excludes cancelled orders", async () => {
    expect(await runMetric("revenue")).toBe(EXPECTED.revenue);

    const { rows } = await analyticsPool.query<{ all_orders: string }>(
      "SELECT SUM(quantity * unit_price) AS all_orders FROM order_items",
    );
    expect(Number(rows[0]!.all_orders)).toBeGreaterThan(EXPECTED.revenue);
  });

  it("order count matches the seed", async () => {
    expect(await runMetric("order_count")).toBe(EXPECTED.order_count);
  });

  it("average order value equals revenue / order count", async () => {
    expect(await runMetric("average_order_value")).toBeCloseTo(EXPECTED.revenue / EXPECTED.order_count, 2);
  });
});
