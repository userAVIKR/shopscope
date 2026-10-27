// Shapes of every backend response. Responses are checked against these at runtime,
// so a backend change shows up as a clear error instead of a broken screen.
import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const columnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["number", "string", "date", "boolean"]),
});
export type Column = z.infer<typeof columnSchema>;

export const visualizationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("metric"), valueKey: z.string() }),
  z.object({ type: z.literal("line"), xKey: z.string(), yKeys: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("bar"), xKey: z.string(), yKeys: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("table") }),
]);
export type Visualization = z.infer<typeof visualizationSchema>;

export const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type Cell = z.infer<typeof cellSchema>;
export type Row = Record<string, Cell>;

export const resultSchema = z.object({
  columns: z.array(columnSchema),
  rows: z.array(z.record(z.string(), cellSchema)),
  rowCount: z.number(),
  truncated: z.boolean(),
  visualization: visualizationSchema,
});
export type QueryResult = z.infer<typeof resultSchema>;

const issueSchema = z.object({ code: z.string(), message: z.string() });

export const queryResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["succeeded", "unanswerable", "rejected", "failed"]),
  question: z.string(),
  datasetId: z.string(),
  summary: z.string(),
  sql: z.string().nullable(),
  validation: z.object({ ok: z.boolean(), issues: z.array(issueSchema) }).nullable(),
  repaired: z.boolean(),
  result: resultSchema.nullable(),
  error: issueSchema.nullable(),
  model: z.string().nullable(),
  durationMs: z.number(),
  createdAt: z.string(),
});
export type QueryResponse = z.infer<typeof queryResponseSchema>;

export const historyItemSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  question: z.string(),
  generatedSql: z.string().nullable(),
  explanation: z.string().nullable(),
  status: z.enum(["SUCCEEDED", "REJECTED", "UNANSWERABLE", "FAILED"]),
  repaired: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  rowCount: z.number().nullable(),
  durationMs: z.number().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyPageSchema = z.object({
  items: z.array(historyItemSchema),
  nextCursor: z.string().nullable(),
});

export const reportSchema = z.object({
  id: z.string(),
  queryId: z.string().nullable(),
  datasetId: z.string(),
  name: z.string(),
  question: z.string(),
  sql: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Report = z.infer<typeof reportSchema>;

export const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({
    appDatabase: z.string(),
    analyticsDatabase: z.string(),
    aiModel: z.string(),
  }),
  ai: z.object({ provider: z.string(), model: z.string() }),
});
export type Health = z.infer<typeof healthSchema>;
