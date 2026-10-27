"use client";

import { BarChart3, BookmarkPlus, Check, Info, Table2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ResultsChart } from "@/components/charts/ResultsChart";
import { ResultsTable } from "@/components/tables/ResultsTable";
import { formatNumber, isMoneyColumn } from "@/lib/format";
import { findColumn, safeVisualization, sortByX } from "@/lib/visualization";
import { ApiError } from "@/services/api-client";
import { createReport } from "@/services/report-service";
import type { QueryResult } from "@/types/api";
import styles from "./Analytics.module.css";

type Card = { label: string; value: string; note: string };

// Headline numbers derived from the rows that came back. Nothing here is hardcoded.
function summaryCards(result: QueryResult): Card[] {
  const viz = safeVisualization(result);
  const cards: Card[] = [];

  if (viz.type === "metric") {
    const column = findColumn(result.columns, viz.valueKey)!;
    const value = result.rows[0]?.[viz.valueKey];
    cards.push({ label: column.label, value: typeof value === "number" ? formatNumber(value, column.key) : "—", note: "From query results" });
  } else if (viz.type === "bar" || viz.type === "line") {
    const x = findColumn(result.columns, viz.xKey)!;
    const y = findColumn(result.columns, viz.yKeys[0]!)!;
    const points = result.rows.filter((row) => typeof row[y.key] === "number");
    if (points.length > 0) {
      const peak = points.reduce((best, row) => ((row[y.key] as number) > (best[y.key] as number) ? row : best));
      cards.push({
        label: `Highest ${y.label.toLowerCase()}`,
        value: formatNumber(peak[y.key] as number, y.key),
        note: `${x.label}: ${String(peak[x.key])}`,
      });
      if (viz.type === "line") {
        const latest = sortByX(points, x.key).at(-1)!;
        cards.push({
          label: `Latest ${y.label.toLowerCase()}`,
          value: formatNumber(latest[y.key] as number, y.key),
          note: `${x.label}: ${String(latest[x.key])}`,
        });
      }
    }
  }

  cards.push({
    label: "Rows returned",
    value: `${result.rowCount.toLocaleString("en-IN")}${result.truncated ? "+" : ""}`,
    note: result.truncated ? "Showing the first 1,000 rows" : `${result.columns.length} column${result.columns.length === 1 ? "" : "s"}`,
  });
  return cards;
}

function SaveReport({ queryId, question }: { queryId: string; question: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(question.slice(0, 120));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setError(null);
    try {
      await createReport(queryId, name.trim());
      setState("saved");
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the report.");
      setState("idle");
    }
  }

  if (state === "saved") {
    return (
      <span className={styles.saved}>
        <Check size={14} /> Saved · <Link href="/reports">View reports</Link>
      </span>
    );
  }

  if (!open) {
    return (
      <button type="button" className={styles.ghostButton} onClick={() => setOpen(true)}>
        <BookmarkPlus size={15} /> Save as report
      </button>
    );
  }

  return (
    <form className={styles.saveForm} onSubmit={save}>
      <input
        aria-label="Report name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        required
        autoFocus
      />
      <button type="submit" className={styles.smallButton} disabled={state === "saving" || !name.trim()}>
        {state === "saving" ? "Saving…" : "Save"}
      </button>
      <button type="button" className={styles.ghostButton} onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <span className={styles.inlineError}>{error}</span>}
    </form>
  );
}

type Props = {
  result: QueryResult;
  // Present for a fresh answer, which can be saved as a report.
  save?: { queryId: string; question: string };
};

export function ResultsPanel({ result, save }: Props) {
  const viz = safeVisualization(result);
  const hasChart = viz.type !== "table";
  const [view, setView] = useState<"chart" | "table">(hasChart ? "chart" : "table");
  const showsMoney = result.columns.some((c) => c.type === "number" && isMoneyColumn(c.key));

  return (
    <div className={styles.results}>
      <div className={styles.cards}>
        {summaryCards(result).map((card) => (
          <div key={card.label} className={styles.card}>
            <span className={styles.cardLabel}>{card.label}</span>
            <span className={styles.cardValue}>{card.value}</span>
            <span className={styles.cardNote}>{card.note}</span>
          </div>
        ))}
      </div>

      <section className={styles.panel} aria-label="Results">
        <div className={styles.panelHead}>
          <h2>Results</h2>
          <div className={styles.toggle} role="group" aria-label="View">
            <button type="button" aria-pressed={view === "chart"} disabled={!hasChart} onClick={() => setView("chart")}>
              <BarChart3 size={15} /> Chart view
            </button>
            <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
              <Table2 size={15} /> Table view
            </button>
          </div>
        </div>

        {view === "chart" && hasChart ? <ResultsChart result={result} /> : <ResultsTable result={result} />}

        <div className={styles.panelFoot}>
          {showsMoney && (
            <span className={styles.footnote}>
              <Info size={13} /> Revenue is quantity × price paid, in INR, and excludes cancelled orders.
            </span>
          )}
          {save && <SaveReport queryId={save.queryId} question={save.question} />}
        </div>
      </section>
    </div>
  );
}
