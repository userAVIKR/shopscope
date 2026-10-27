"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCell } from "@/lib/format";
import type { Cell, QueryResult } from "@/types/api";
import styles from "./ResultsTable.module.css";

type Sort = { key: string; direction: "asc" | "desc" } | null;

function compare(a: Cell, b: Cell): number {
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function ResultsTable({ result }: { result: QueryResult }) {
  const [sort, setSort] = useState<Sort>(null);

  const rows = useMemo(() => {
    if (!sort) return result.rows;
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...result.rows].sort((x, y) => sign * compare(x[sort.key] ?? null, y[sort.key] ?? null));
  }, [result.rows, sort]);

  function toggle(key: string) {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "desc" };
      return current.direction === "desc" ? { key, direction: "asc" } : null;
    });
  }

  if (result.rows.length === 0) return <p className={styles.empty}>The query ran but returned no rows.</p>;

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {result.columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  data-numeric={column.type === "number" || undefined}
                  aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button type="button" onClick={() => toggle(column.key)}>
                    {column.label}
                    {active && (sort.direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {result.columns.map((column) => (
                <td key={column.key} data-numeric={column.type === "number" || undefined}>
                  {formatCell(row[column.key] ?? null, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
