"use client";

import { LoaderCircle, Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SqlViewer } from "@/components/sql/SqlViewer";
import { ResultsPanel } from "@/features/analytics/ResultsPanel";
import { formatRelativeTime } from "@/lib/format";
import { ApiError } from "@/services/api-client";
import { deleteReport, listReports, runReport } from "@/services/report-service";
import type { QueryResult, Report } from "@/types/api";
import styles from "./Reports.module.css";

type RunState = { status: "idle" } | { status: "running" } | { status: "done"; result: QueryResult } | { status: "error"; message: string };

function ReportCard({ report, onDeleted }: { report: Report; onDeleted: (id: string) => void }) {
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function open() {
    setRun({ status: "running" });
    try {
      // Re-runs with fresh data. The backend validates the stored SQL again first.
      const { result } = await runReport(report.id);
      setRun({ status: "done", result });
    } catch (err) {
      setRun({ status: "error", message: err instanceof ApiError ? err.message : "Could not run this report." });
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await deleteReport(report.id);
      onDeleted(report.id);
    } catch (err) {
      setDeleting(false);
      setRun({ status: "error", message: err instanceof ApiError ? err.message : "Could not delete this report." });
    }
  }

  return (
    <li className={styles.card}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.name}>{report.name}</h2>
          {report.question !== report.name && <p className={styles.question}>{report.question}</p>}
          <p className={styles.meta}>Saved {formatRelativeTime(report.createdAt)}</p>
        </div>
        <div className={styles.actions}>
          {confirming ? (
            <>
              <span className={styles.confirmText}>Delete this report?</span>
              <button type="button" className={styles.danger} onClick={() => void remove()} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button type="button" className={styles.ghost} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.primary} onClick={() => void open()} disabled={run.status === "running"}>
                {run.status === "running" ? <LoaderCircle size={14} className={styles.spin} /> : <Play size={14} />}
                {run.status === "done" ? "Refresh" : "Open"}
              </button>
              <button type="button" className={styles.icon} onClick={() => setConfirming(true)} aria-label={`Delete ${report.name}`}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {run.status === "error" && (
        <p className={styles.error} role="alert">
          {run.message}
        </p>
      )}
      {run.status === "done" && (
        <div className={styles.body}>
          <ResultsPanel result={run.result} />
          <SqlViewer sql={report.sql} validation={{ ok: true, issues: [] }} />
        </div>
      )}
    </li>
  );
}

export function SavedReports() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load reports."));
  }, []);

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );
  }
  if (!reports) return <p className={styles.meta}>Loading…</p>;

  if (reports.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No saved reports yet.</p>
        <p className={styles.meta}>
          After a question is answered, use <strong>Save as report</strong> to keep it here and re-run it with fresh data any time.
        </p>
        <Link href="/">Ask a question</Link>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} onDeleted={(id) => setReports((r) => r?.filter((x) => x.id !== id) ?? null)} />
      ))}
    </ul>
  );
}
