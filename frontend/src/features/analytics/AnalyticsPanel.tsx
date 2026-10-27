"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { QuestionInput } from "@/components/chat/QuestionInput";
import { SqlViewer } from "@/components/sql/SqlViewer";
import { ApiError } from "@/services/api-client";
import { askQuestion } from "@/services/query-service";
import type { QueryResponse } from "@/types/api";
import styles from "./Analytics.module.css";
import { ResultsPanel } from "./ResultsPanel";

type Turn = {
  key: number;
  question: string;
  response?: QueryResponse;
  error?: string;
};

function Thinking() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.thinking} role="status">
      <LoaderCircle size={16} className={styles.spin} />
      <span>
        {seconds < 4 ? "Writing SQL with the local AI model…" : "Checking and running the query…"}{" "}
        <span className={styles.muted}>{seconds}s</span>
      </span>
    </div>
  );
}

export function AnalyticsPanel({ initialQuestion }: { initialQuestion?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const nextKey = useRef(0);

  async function ask(question: string) {
    const key = nextKey.current++;
    controller.current = new AbortController();
    setBusy(true);
    setTurns((current) => [{ key, question }, ...current]);

    const update = (patch: Partial<Turn>) =>
      setTurns((current) => current.map((turn) => (turn.key === key ? { ...turn, ...patch } : turn)));

    try {
      update({ response: await askQuestion(question, controller.current.signal) });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setTurns((current) => current.filter((turn) => turn.key !== key));
      } else {
        update({ error: error instanceof ApiError ? error.message : "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  return (
    <div className={styles.layout}>
      <QuestionInput onAsk={(q) => void ask(q)} onCancel={() => controller.current?.abort()} busy={busy} initialQuestion={initialQuestion} />

      {turns.length === 0 && (
        <div className={styles.emptyState}>
          <p>Ask a question above, or pick a suggestion.</p>
          <p className={styles.muted}>
            You will get a summary, a chart or table, and the exact SQL that produced it. Queries are checked for safety and
            run read-only.
          </p>
        </div>
      )}

      {turns.map((turn) => (
        <ChatMessage key={turn.key} question={turn.question} response={turn.response}>
          {!turn.response && !turn.error && <Thinking />}

          {turn.error && (
            <div className={styles.requestError} role="alert">
              <CircleAlert size={16} /> {turn.error}
            </div>
          )}

          {turn.response?.result && (
            <ResultsPanel
              result={turn.response.result}
              save={turn.response.status === "succeeded" ? { queryId: turn.response.id, question: turn.question } : undefined}
            />
          )}

          {turn.response?.sql && (
            <SqlViewer
              sql={turn.response.sql}
              validation={turn.response.validation}
              repaired={turn.response.repaired}
              durationMs={turn.response.durationMs}
              model={turn.response.model}
              defaultOpen={turn.response.status === "rejected"}
            />
          )}
        </ChatMessage>
      ))}
    </div>
  );
}
