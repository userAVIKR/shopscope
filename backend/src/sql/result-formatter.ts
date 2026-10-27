// Turns raw database rows into the API's result shape and suggests a chart.
// The frontend draws charts from this; it never guesses from the data itself.

import type { RawResult } from "./sql-executor.js";

export type ColumnType = "number" | "string" | "date" | "boolean";
export type ResultColumn = { key: string; label: string; type: ColumnType };
export type ResultRow = Record<string, string | number | boolean | null>;

export type Visualization =
  | { type: "metric"; valueKey: string }
  | { type: "line" | "bar"; xKey: string; yKeys: string[] }
  | { type: "table" };

export type FormattedResult = {
  columns: ResultColumn[];
  rows: ResultRow[];
  rowCount: number;
  truncated: boolean;
  visualization: Visualization;
};

// PostgreSQL type ids (pg_type.oid).
const NUMBER_TYPES = new Set([20, 21, 23, 700, 701, 1700]); // int8, int2, int4, float4, float8, numeric
const DATE_TYPES = new Set([1082, 1114, 1184]); // date, timestamp, timestamptz
const BOOLEAN_TYPE = 16;

const MAX_BAR_CATEGORIES = 30;

function columnType(dataTypeID: number): ColumnType {
  if (NUMBER_TYPES.has(dataTypeID)) return "number";
  if (DATE_TYPES.has(dataTypeID)) return "date";
  if (dataTypeID === BOOLEAN_TYPE) return "boolean";
  return "string";
}

// "total_revenue" -> "Total revenue"
function toLabel(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : name;
}

// Columns can share a name (e.g. two count(*)), so keys are made unique: count, count_2.
function uniqueKeys(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name}_${n}`;
  });
}

function toValue(value: unknown, type: ColumnType): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  if (type === "boolean") return Boolean(value);
  return String(value);
}

const TIME_LIKE_NAME = /(^|_)(date|day|week|month|year|quarter|period|time)(_|$)/i;

export function suggestVisualization(columns: ResultColumn[], rowCount: number): Visualization {
  const numeric = columns.filter((c) => c.type === "number");
  if (rowCount === 0 || numeric.length === 0) return { type: "table" };

  if (rowCount === 1 && columns.length === 1 && numeric.length === 1) return { type: "metric", valueKey: numeric[0]!.key };

  const isTime = (c: ResultColumn) => c.type === "date" || TIME_LIKE_NAME.test(c.key);
  const [first, ...rest] = columns;
  // Period columns (year, month, ...) are axes, never plotted values.
  const yKeys = rest.filter((c) => c.type === "number" && !isTime(c)).map((c) => c.key);
  if (!first || yKeys.length === 0 || rowCount < 2) return { type: "table" };

  if (isTime(first)) {
    // Split periods such as (year, month) have no single x-axis; show them as a table.
    if (rest.some(isTime)) return { type: "table" };
    return { type: "line", xKey: first.key, yKeys };
  }
  if (first.type === "string" && rowCount <= MAX_BAR_CATEGORIES) return { type: "bar", xKey: first.key, yKeys };
  return { type: "table" };
}

export function formatResult(raw: RawResult): FormattedResult {
  const keys = uniqueKeys(raw.fields.map((f) => f.name));
  const columns = raw.fields.map((f, i) => ({ key: keys[i]!, label: toLabel(f.name), type: columnType(f.dataTypeID) }));

  const rows = raw.rows.map((values) =>
    Object.fromEntries(columns.map((column, i) => [column.key, toValue(values[i], column.type)])),
  );

  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated: raw.truncated,
    visualization: suggestVisualization(columns, rows.length),
  };
}
