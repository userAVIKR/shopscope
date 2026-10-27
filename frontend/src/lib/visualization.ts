import type { Column, QueryResult, Row, Visualization } from "@/types/api";

// The backend suggests a chart; this checks the suggestion against the columns that actually came back.
// Anything that does not fit falls back to the table, so a bad config can never draw a misleading chart.
export function safeVisualization(result: QueryResult): Visualization {
  const viz = result.visualization;
  const byKey = new Map(result.columns.map((c) => [c.key, c]));
  const isNumeric = (key: string) => byKey.get(key)?.type === "number";

  if (viz.type === "metric") {
    return isNumeric(viz.valueKey) && result.rows.length === 1 ? viz : { type: "table" };
  }
  if (viz.type === "line" || viz.type === "bar") {
    const ok = byKey.has(viz.xKey) && viz.yKeys.every(isNumeric) && result.rows.length > 1;
    return ok ? viz : { type: "table" };
  }
  return viz;
}

// Line charts read left to right, so sort by the x value even if the query ordered by something else.
export function sortByX(rows: Row[], xKey: string): Row[] {
  return [...rows].sort((a, b) => {
    const x = a[xKey];
    const y = b[xKey];
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x ?? "").localeCompare(String(y ?? ""));
  });
}

export function findColumn(columns: Column[], key: string): Column | undefined {
  return columns.find((c) => c.key === key);
}
