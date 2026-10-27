// Question in, SQL proposal out. The proposal is NOT trusted: src/sql validates it before anything runs.

import { z } from "zod";
import { buildModelContext, getDataCoverage } from "../analytics/schema.service.js";
import { analyticsPool } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";
import { type ChatMessage, chatJson } from "./model.js";
import { buildRepairMessages, buildSqlMessages } from "./prompts.js";

const MAX_SQL_LENGTH = 5_000;

const modelReplySchema = z.object({
  status: z.enum(["ok", "cannot_answer"]),
  sql: z.string(),
  explanation: z.string(),
});

// The model provider constrains its output to this JSON Schema, generated from the same Zod schema used to check it.
const MODEL_REPLY_FORMAT = z.toJSONSchema(modelReplySchema);

export type SqlProposal =
  | { status: "ok"; sql: string; explanation: string; model: string; durationMs: number }
  | { status: "cannot_answer"; explanation: string; model: string; durationMs: number };

export type GenerateSqlInput = {
  question: string;
  datasetId: string;
  // YYYY-MM-DD. Defaults to the server's local date.
  today?: string;
};

// The data range changes only when the database is re-seeded, so cache it briefly.
const COVERAGE_TTL_MS = 10 * 60 * 1000;
let coverageCache: { value: { from: string; to: string }; expiresAt: number } | undefined;

async function cachedCoverage() {
  if (!coverageCache || coverageCache.expiresAt < Date.now()) {
    coverageCache = { value: await getDataCoverage(analyticsPool), expiresAt: Date.now() + COVERAGE_TTL_MS };
  }
  return coverageCache.value;
}

const localDate = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

async function buildContext(input: GenerateSqlInput) {
  return buildModelContext(input.datasetId, { today: input.today ?? localDate(), coverage: await cachedCoverage() });
}

// Models sometimes wrap SQL in markdown fences or add a trailing semicolon. Remove only that.
export function cleanSql(sql: string): string {
  return sql
    .trim()
    .replace(/^```(?:sql)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
    .replace(/;\s*$/, "")
    .trim();
}

export function parseModelReply(content: string, meta: { model: string; durationMs: number }): SqlProposal {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new HttpError(502, "INVALID_MODEL_RESPONSE", "The AI model did not return valid JSON.");
  }

  const reply = modelReplySchema.safeParse(json);
  if (!reply.success) {
    throw new HttpError(502, "INVALID_MODEL_RESPONSE", "The AI model's answer was not in the expected format.");
  }

  const explanation = reply.data.explanation.trim();
  if (reply.data.status === "cannot_answer") {
    return { status: "cannot_answer", explanation: explanation || "This question cannot be answered from the data.", ...meta };
  }

  const sql = cleanSql(reply.data.sql);
  if (!sql) throw new HttpError(502, "INVALID_MODEL_RESPONSE", "The AI model did not return any SQL.");
  if (sql.length > MAX_SQL_LENGTH) throw new HttpError(502, "INVALID_MODEL_RESPONSE", "The AI model's SQL is too long.");

  return { status: "ok", sql, explanation, ...meta };
}

async function ask(messages: ChatMessage[]): Promise<SqlProposal> {
  const { content, model, durationMs } = await chatJson(messages, MODEL_REPLY_FORMAT);
  return parseModelReply(content, { model, durationMs });
}

export async function generateSql(input: GenerateSqlInput): Promise<SqlProposal> {
  return ask(buildSqlMessages(input.question, await buildContext(input)));
}

// Second and final attempt, given why the first SQL was rejected. The result is validated again.
export async function repairSql(input: GenerateSqlInput, previousSql: string, problem: string): Promise<SqlProposal> {
  return ask(buildRepairMessages(input.question, await buildContext(input), previousSql, problem));
}
