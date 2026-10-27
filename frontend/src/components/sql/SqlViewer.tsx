"use client";

import { Check, CircleAlert, Code2, Copy, ShieldCheck, Wrench } from "lucide-react";
import { useState } from "react";
import { formatDuration } from "@/lib/format";
import styles from "./SqlViewer.module.css";

type Props = {
  sql: string;
  // null when the SQL was never validated (e.g. a saved report shown before running)
  validation?: { ok: boolean; issues: { code: string; message: string }[] } | null;
  repaired?: boolean;
  durationMs?: number | null;
  model?: string | null;
  defaultOpen?: boolean;
};

// Line breaks before the main clauses, so model output on one line is readable.
function prettySql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(
      /\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION|(?:LEFT |RIGHT |INNER |FULL )?JOIN|WITH)\b/gi,
      "\n$1",
    )
    .trim();
}

export function SqlViewer({ sql, validation, repaired, durationMs, model, defaultOpen = false }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <details className={styles.viewer} open={defaultOpen}>
      <summary className={styles.summary}>
        <span className={styles.title}>
          <Code2 size={16} /> Generated SQL
        </span>
        <span className={styles.badge}>Read-only</span>
      </summary>

      <div className={styles.meta}>
        {validation &&
          (validation.ok ? (
            <span className={styles.pass}>
              <ShieldCheck size={14} /> Passed safety checks
            </span>
          ) : (
            <span className={styles.fail}>
              <CircleAlert size={14} /> Rejected by safety checks — not run
            </span>
          ))}
        {repaired && (
          <span className={styles.note}>
            <Wrench size={13} /> Fixed on second attempt
          </span>
        )}
        {durationMs != null && <span className={styles.note}>Total time {formatDuration(durationMs)}</span>}
        {model && <span className={styles.note}>Model {model}</span>}
      </div>

      {validation && !validation.ok && (
        <ul className={styles.issues}>
          {validation.issues.map((issue) => (
            <li key={issue.code + issue.message}>{issue.message}</li>
          ))}
        </ul>
      )}

      <div className={styles.codeWrap}>
        <pre className={styles.code}>
          <code>{prettySql(sql)}</code>
        </pre>
        <button type="button" className={styles.copy} onClick={() => void copy()} aria-label="Copy SQL">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </details>
  );
}
