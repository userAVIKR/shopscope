"use client";

import { ChevronDown, CircleAlert, CircleCheck, CircleHelp, RotateCcw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SqlViewer } from "@/components/sql/SqlViewer";
import { formatDuration, formatRelativeTime } from "@/lib/format";
import { ApiError } from "@/services/api-client";
import { listHistory } from "@/services/history-service";
import type { HistoryItem } from "@/types/api";
import styles from "./History.module.css";

const STATUS = {
  SUCCEEDED: { icon: CircleCheck, label: "Answered", tone: "good" },
  UNANSWERABLE: { icon: CircleHelp, label: "Can't answer", tone: "info" },
  REJECTED: { icon: ShieldAlert, label: "Blocked", tone: "warning" },
  FAILED: { icon: CircleAlert, label: "Failed", tone: "critical" },
} as const;

function HistoryRow({ item }: { item: HistoryItem }) {
  const [open, setOpen] = useState(false);
  const status = STATUS[item.status];

  return (
    <li className={styles.item}>
      <button type="button" className={styles.row} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={styles.status} data-tone={status.tone}>
          <status.icon size={14} /> {status.label}
        </span>
        <span className={styles.question}>{item.question}</span>
        <span className={styles.meta}>
          {item.rowCount != null && <span>{item.rowCount} rows</span>}
          <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString("en-IN")}>
            {formatRelativeTime(item.createdAt)}
          </time>
        </span>
        <ChevronDown size={16} className={styles.chevron} />
      </button>

      {open && (
        <div className={styles.detail}>
          {item.explanation && <p className={styles.explanation}>{item.explanation}</p>}
          {item.errorMessage && (
            <p className={styles.error}>
              {item.errorCode}: {item.errorMessage}
            </p>
          )}
          {item.generatedSql && (
            <SqlViewer
              sql={item.generatedSql}
              validation={item.status === "REJECTED" ? { ok: false, issues: [] } : item.status === "SUCCEEDED" ? { ok: true, issues: [] } : null}
              repaired={item.repaired}
              durationMs={item.durationMs}
              model={item.model}
              defaultOpen
            />
          )}
          <div className={styles.actions}>
            {item.durationMs != null && <span className={styles.muted}>Took {formatDuration(item.durationMs)}</span>}
            <Link className={styles.askAgain} href={`/?q=${encodeURIComponent(item.question)}`}>
              <RotateCcw size={14} /> Ask again
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

export function HistoryList() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (after?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listHistory(after);
      setItems((current) => (after ? [...current, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loading && !error && items.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No questions yet.</p>
        <Link href="/">Ask your first question</Link>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((item) => (
            <HistoryRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {loading && <p className={styles.muted}>Loading…</p>}
      {!loading && cursor && (
        <button type="button" className={styles.more} onClick={() => void load(cursor)}>
          Load more
        </button>
      )}
    </div>
  );
}
