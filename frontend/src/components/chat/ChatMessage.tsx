import { CircleAlert, CircleCheck, CircleHelp, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { formatDuration } from "@/lib/format";
import type { QueryResponse } from "@/types/api";
import styles from "./Chat.module.css";

// Every status has an icon and a word, not just a colour.
const STATUS = {
  succeeded: { icon: CircleCheck, label: "Answered", tone: "good" },
  unanswerable: { icon: CircleHelp, label: "Can't answer from this data", tone: "info" },
  rejected: { icon: ShieldAlert, label: "Blocked by safety checks", tone: "warning" },
  failed: { icon: CircleAlert, label: "Query failed", tone: "critical" },
} as const;

type Props = {
  question: string;
  response?: QueryResponse;
  children?: ReactNode;
};

// One question and the answer's headline. Results (chart, table, SQL) are passed as children.
export function ChatMessage({ question, response, children }: Props) {
  const status = response ? STATUS[response.status] : null;

  return (
    <article className={styles.message}>
      <p className={styles.question}>{question}</p>

      {response && status && (
        <div className={styles.answer} data-tone={status.tone}>
          <div className={styles.answerHead}>
            <span className={styles.statusLabel}>
              <status.icon size={15} /> {status.label}
            </span>
            <span className={styles.answerTime}>{formatDuration(response.durationMs)}</span>
          </div>
          <p className={styles.summary}>{response.summary}</p>
          {response.error && response.status === "failed" && <p className={styles.errorDetail}>{response.error.message}</p>}
        </div>
      )}

      {children}
    </article>
  );
}
