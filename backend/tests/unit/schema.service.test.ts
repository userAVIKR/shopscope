import { describe, expect, it } from "vitest";
import { METRICS } from "../../src/analytics/metrics.js";
import {
  buildModelContext,
  DEFAULT_DATASET_ID,
  getAllowedColumns,
  getAllowedJoins,
  getDataset,
  getPublicSchema,
  listDatasets,
} from "../../src/analytics/schema.service.js";
import { HttpError } from "../../src/utils/http-error.js";

const allowed = getAllowedColumns(DEFAULT_DATASET_ID);
const isAllowed = (table: string, column: string) => allowed.get(table)?.has(column) ?? false;
const context = buildModelContext(DEFAULT_DATASET_ID, {
  today: "2026-10-27",
  coverage: { from: "2024-10-01", to: "2026-09-30" },
});

describe("datasets", () => {
  it("lists the sales dataset", () => {
    expect(listDatasets()).toEqual([expect.objectContaining({ id: "sales", name: "Sales" })]);
  });

  it("returns 404 for an unknown dataset", () => {
    expect(() => getDataset("nope")).toThrow(HttpError);
    try {
      getDataset("nope");
    } catch (error) {
      expect((error as HttpError).status).toBe(404);
    }
  });
});

describe("sensitive columns", () => {
  it("are removed from the public schema", () => {
    const customers = getPublicSchema(DEFAULT_DATASET_ID).tables.find((t) => t.name === "customers")!;
    expect(customers.columns.map((c) => c.name)).toEqual(["id", "city", "created_at"]);
  });

  it("are not allowed for the SQL validator", () => {
    expect(isAllowed("customers", "name")).toBe(false);
    expect(isAllowed("customers", "city")).toBe(true);
  });

  it("never appear in the AI context", () => {
    const sensitive = getDataset(DEFAULT_DATASET_ID).tables.flatMap((t) => t.columns.filter((c) => c.sensitive));
    expect(sensitive.length).toBeGreaterThan(0);
    for (const column of sensitive) expect(context).not.toContain(column.description);
  });
});

describe("relationships and metrics", () => {
  it("only join approved columns", () => {
    for (const { from, to } of getAllowedJoins(DEFAULT_DATASET_ID)) {
      expect(isAllowed(from.table, from.column), `${from.table}.${from.column}`).toBe(true);
      expect(isAllowed(to.table, to.column), `${to.table}.${to.column}`).toBe(true);
    }
  });

  it.each(METRICS.map((m) => [m.id, m] as const))("%s only uses approved tables and columns", (_id, metric) => {
    for (const table of metric.tables) expect(allowed.has(table), table).toBe(true);
    for (const [, table, column] of `${metric.expression} ${metric.filter}`.matchAll(/\b([a-z_]+)\.([a-z_]+)\b/g)) {
      expect(isAllowed(table!, column!), `${table}.${column}`).toBe(true);
    }
  });

  it("every metric excludes cancelled orders", () => {
    for (const metric of METRICS) expect(metric.filter).toContain("'cancelled'");
  });
});

describe("AI context", () => {
  it("describes every approved table, join and metric", () => {
    for (const table of allowed.keys()) expect(context).toContain(`${table}:`);
    expect(context).toContain("order_items.order_id = orders.id");
    for (const metric of METRICS) expect(context).toContain(metric.expression);
  });

  it("includes today's date, the data range and the cancelled-orders rule", () => {
    expect(context).toContain("Today's date: 2026-10-27.");
    expect(context).toContain("from 2024-10-01 to 2026-09-30");
    expect(context).toMatch(/Cancelled orders .* never count/);
  });

  it("lists the allowed order statuses", () => {
    expect(context).toContain("one of: pending, paid, shipped, delivered, cancelled");
  });

  it("stays compact enough for a small local model", () => {
    expect(context.length).toBeLessThan(4000);
  });
});
