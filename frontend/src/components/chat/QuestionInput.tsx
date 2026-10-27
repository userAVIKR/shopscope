"use client";

import { ArrowRight, Square } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import styles from "./Chat.module.css";

const MAX_LENGTH = 500;

const SUGGESTIONS = [
  "What was the total revenue last month?",
  "Top 5 product categories by revenue in 2026",
  "Monthly order count over the last 12 months",
  "Which cities have the most customers?",
  "Average order value by category",
];

type Props = {
  onAsk: (question: string) => void;
  onCancel: () => void;
  busy: boolean;
  initialQuestion?: string;
};

export function QuestionInput({ onAsk, onCancel, busy, initialQuestion = "" }: Props) {
  const [question, setQuestion] = useState(initialQuestion);
  const trimmed = question.trim();
  const canAsk = !busy && trimmed.length >= 3 && trimmed.length <= MAX_LENGTH;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (canAsk) onAsk(trimmed);
  }

  // Enter asks, Shift+Enter adds a new line.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section className={styles.composer} aria-label="Ask a question">
      <form onSubmit={submit}>
        <label htmlFor="question" className="eyebrow">
          Ask your data
        </label>
        <textarea
          id="question"
          className={styles.textarea}
          placeholder="e.g. Which product categories generated the most revenue last month?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_LENGTH}
          rows={2}
          disabled={busy}
        />
        <div className={styles.composerFooter}>
          <span className={styles.counter} data-near-limit={question.length > MAX_LENGTH - 50 || undefined}>
            {question.length}/{MAX_LENGTH}
          </span>
          {busy ? (
            <button type="button" className={styles.secondaryButton} onClick={onCancel}>
              <Square size={12} /> Stop
            </button>
          ) : (
            <button type="submit" className={styles.askButton} disabled={!canAsk}>
              Ask <ArrowRight size={16} />
            </button>
          )}
        </div>
      </form>

      <div className={styles.suggestions} aria-label="Suggested questions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className={styles.chip}
            disabled={busy}
            onClick={() => {
              setQuestion(suggestion);
              onAsk(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
