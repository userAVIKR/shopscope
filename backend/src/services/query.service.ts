// The full question -> answer pipeline:
//   generate SQL -> validate -> run read-only -> format
// with at most ONE repair attempt, used when validation or execution fails. Repaired SQL is validated again.
// Every question is saved to history, whatever the outcome.

import { generateSql, type GenerateSqlInput, repairSql, type SqlProposal } from "../ai/sql-generator.js";
import { prisma } from "../config/database.js";
import type { QueryStatus } from "../generated/prisma/client.js";
import { formatResult, type FormattedResult } from "../sql/result-formatter.js";
import { executeReadOnly, SqlExecutionError } from "../sql/sql-executor.js";
import { describeIssues, validateSql, type ValidationIssue } from "../sql/sql-validator.js";
import { HttpError } from "../utils/http-error.js";

export type QueryOutcome = "succeeded" | "unanswerable" | "rejected" | "failed";

export type QueryResponse = {
  id: string;
  status: QueryOutcome;
  question: string;
  datasetId: string;
  summary: string;
  sql: string | null;
  validation: { ok: boolean; issues: ValidationIssue[] } | null;
  repaired: boolean;
  result: FormattedResult | null;
  error: { code: string; message: string } | null;
  model: string | null;
  durationMs: number;
  createdAt: Date;
};

const HISTORY_STATUS: Record<QueryOutcome, QueryStatus> = {
  succeeded: "SUCCEEDED",
  unanswerable: "UNANSWERABLE",
  rejected: "REJECTED",
  failed: "FAILED",
};

type Attempt =
  | { kind: "unanswerable"; proposal: SqlProposal }
  | { kind: "rejected"; sql: string; issues: ValidationIssue[] }
  | { kind: "execution_failed"; sql: string; error: SqlExecutionError }
  | { kind: "succeeded"; sql: string; result: FormattedResult };

// Validate and run one proposal. Never throws for bad SQL; returns what happened instead.
async function tryProposal(proposal: SqlProposal, datasetId: string): Promise<Attempt> {
  if (proposal.status === "cannot_answer") return { kind: "unanswerable", proposal };

  const validation = validateSql(proposal.sql, datasetId);
  if (!validation.ok) return { kind: "rejected", sql: proposal.sql, issues: validation.issues };

  try {
    return { kind: "succeeded", sql: validation.sql, result: formatResult(await executeReadOnly(validation.sql)) };
  } catch (error) {
    if (error instanceof SqlExecutionError) return { kind: "execution_failed", sql: validation.sql, error };
    throw error;
  }
}

// Timeouts and permission errors are not fixed by rewriting the SQL, so only these two outcomes get a repair.
function repairReason(attempt: Attempt): string | null {
  if (attempt.kind === "rejected") return describeIssues(attempt.issues);
  if (attempt.kind === "execution_failed" && attempt.error.code === "QUERY_FAILED") return attempt.error.message;
  return null;
}

export async function askQuestion(userId: string, input: Omit<GenerateSqlInput, "today">): Promise<QueryResponse> {
  const started = Date.now();
  let proposal: SqlProposal | undefined;
  let repaired = false;

  try {
    proposal = await generateSql(input);
    let attempt = await tryProposal(proposal, input.datasetId);

    const reason = repairReason(attempt);
    if (reason && (attempt.kind === "rejected" || attempt.kind === "execution_failed")) {
      repaired = true;
      proposal = await repairSql(input, attempt.sql, reason);
      attempt = await tryProposal(proposal, input.datasetId);
    }

    return await saveOutcome(userId, input, attempt, proposal, repaired, Date.now() - started);
  } catch (error) {
    // Model or infrastructure failure (Ollama down, timeout...). Record it, then let the error handler respond.
    if (error instanceof HttpError) {
      await prisma.queryHistory.create({
        data: {
          userId,
          datasetId: input.datasetId,
          question: input.question,
          status: "FAILED",
          repaired,
          errorCode: error.code,
          errorMessage: error.message,
          model: proposal?.model ?? null,
          durationMs: Date.now() - started,
        },
      });
    }
    throw error;
  }
}

async function saveOutcome(
  userId: string,
  input: Omit<GenerateSqlInput, "today">,
  attempt: Attempt,
  proposal: SqlProposal,
  repaired: boolean,
  durationMs: number,
): Promise<QueryResponse> {
  const base = { question: input.question, datasetId: input.datasetId, repaired, model: proposal.model, durationMs };

  let response: Omit<QueryResponse, "id" | "createdAt">;
  switch (attempt.kind) {
    case "succeeded":
      response = {
        ...base,
        status: "succeeded",
        summary: proposal.explanation || "Here are the results.",
        sql: attempt.sql,
        validation: { ok: true, issues: [] },
        result: attempt.result,
        error: null,
      };
      break;
    case "unanswerable":
      response = {
        ...base,
        status: "unanswerable",
        summary: attempt.proposal.explanation,
        sql: null,
        validation: null,
        result: null,
        error: null,
      };
      break;
    case "rejected":
      response = {
        ...base,
        status: "rejected",
        summary: "The generated SQL did not pass the safety checks, so it was not run. Try rephrasing the question.",
        sql: attempt.sql,
        validation: { ok: false, issues: attempt.issues },
        result: null,
        error: { code: "SQL_REJECTED", message: describeIssues(attempt.issues) },
      };
      break;
    case "execution_failed":
      response = {
        ...base,
        status: "failed",
        summary: "The query could not be completed.",
        sql: attempt.sql,
        validation: { ok: true, issues: [] },
        result: null,
        error: { code: attempt.error.code, message: attempt.error.message },
      };
      break;
  }

  const record = await prisma.queryHistory.create({
    data: {
      userId,
      datasetId: response.datasetId,
      question: response.question,
      generatedSql: response.sql,
      explanation: proposal.explanation || null,
      status: HISTORY_STATUS[response.status],
      repaired,
      errorCode: response.error?.code ?? null,
      errorMessage: response.error?.message ?? null,
      rowCount: response.result?.rowCount ?? null,
      durationMs,
      model: response.model,
    },
  });

  return { ...response, id: record.id, createdAt: record.createdAt };
}

// Re-runs SQL that was already saved (e.g. a report). It is validated again: stored SQL is never trusted.
export async function runSavedSql(sql: string, datasetId: string): Promise<FormattedResult> {
  const validation = validateSql(sql, datasetId);
  if (!validation.ok) throw new HttpError(422, "SQL_REJECTED", describeIssues(validation.issues));

  try {
    return formatResult(await executeReadOnly(validation.sql));
  } catch (error) {
    if (!(error instanceof SqlExecutionError)) throw error;
    const status = error.code === "QUERY_TIMEOUT" ? 504 : error.code === "DATABASE_UNAVAILABLE" ? 503 : 422;
    throw new HttpError(status, error.code, error.message);
  }
}
