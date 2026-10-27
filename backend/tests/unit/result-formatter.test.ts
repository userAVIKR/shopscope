import { describe, expect, it } from "vitest";
import { formatResult, suggestVisualization, type ResultColumn } from "../../src/sql/result-formatter.js";

const INT8 = 20, NUMERIC = 1700, TEXT = 25, DATE = 1082, BOOL = 16;

describe("formatResult", () => {
  it("converts numbers, keeps dates as text and labels columns", () => {
    const result = formatResult({
      fields: [{ name: "order_date", dataTypeID: DATE }, { name: "total_revenue", dataTypeID: NUMERIC }, { name: "active", dataTypeID: BOOL }],
      rows: [["2026-09-01", "1253170.00", true], ["2026-09-02", null, false]],
      truncated: false,
      durationMs: 1,
    });

    expect(result.columns).toEqual([
      { key: "order_date", label: "Order date", type: "date" },
      { key: "total_revenue", label: "Total revenue", type: "number" },
      { key: "active", label: "Active", type: "boolean" },
    ]);
    expect(result.rows).toEqual([
      { order_date: "2026-09-01", total_revenue: 1253170, active: true },
      { order_date: "2026-09-02", total_revenue: null, active: false },
    ]);
    expect(result.rowCount).toBe(2);
  });

  it("gives duplicate column names unique keys", () => {
    const result = formatResult({
      fields: [{ name: "count", dataTypeID: INT8 }, { name: "count", dataTypeID: INT8 }],
      rows: [["1", "2"]],
      truncated: false,
      durationMs: 1,
    });
    expect(result.rows).toEqual([{ count: 1, count_2: 2 }]);
  });
});

describe("suggestVisualization", () => {
  const col = (key: string, type: ResultColumn["type"]): ResultColumn => ({ key, label: key, type });

  it.each([
    ["a single number", [col("revenue", "number")], 1, { type: "metric", valueKey: "revenue" }],
    ["a date series", [col("order_date", "date"), col("revenue", "number")], 30, { type: "line", xKey: "order_date", yKeys: ["revenue"] }],
    ["months as numbers", [col("month", "number"), col("orders", "number")], 12, { type: "line", xKey: "month", yKeys: ["orders"] }],
    ["year and month split into two columns", [col("year", "number"), col("month", "number"), col("revenue", "number")], 12, { type: "table" }],
    ["categories", [col("category", "string"), col("revenue", "number"), col("orders", "number")], 10, { type: "bar", xKey: "category", yKeys: ["revenue", "orders"] }],
    ["too many categories", [col("product", "string"), col("revenue", "number")], 100, { type: "table" }],
    ["no numbers", [col("city", "string")], 5, { type: "table" }],
    ["no rows", [col("revenue", "number")], 0, { type: "table" }],
  ])("%s", (_name, columns, rowCount, expected) => {
    expect(suggestVisualization(columns, rowCount)).toEqual(expected);
  });
});
