// Runs already-validated SQL as the SELECT-only reader, inside a read-only transaction
// with a timeout and a row cap. Defence in depth: these limits hold even if validation missed something.

import pg from "pg";
import { analyticsPool } from "../config/database.js";

export const DEFAULT_MAX_ROWS = 1_000;
export const DEFAULT_TIMEOUT_MS = 5_000;

export type RawResult = {
  fields: { name: string; dataTypeID: number }[];
  rows: unknown[][];
  truncated: boolean;
  durationMs: number;
};

export type ExecutionErrorCode = "QUERY_TIMEOUT" | "PERMISSION_DENIED" | "QUERY_FAILED" | "DATABASE_UNAVAILABLE";

export class SqlExecutionError extends Error {
  constructor(
    readonly code: ExecutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SqlExecutionError";
  }
}

// Dates and timestamps stay as the strings PostgreSQL sent, so no time zone shifting happens in JavaScript.
const KEEP_AS_TEXT = new Set([1082, 1114, 1184]); // date, timestamp, timestamptz
const typeParsers = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    KEEP_AS_TEXT.has(oid) ? (value: string) => value : pg.types.getTypeParser(oid, format as "text")) as typeof pg.types.getTypeParser,
};

export async function executeReadOnly(
  sql: string,
  options: { maxRows?: number; timeoutMs?: number; pool?: pg.Pool } = {},
): Promise<RawResult> {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pool = options.pool ?? analyticsPool;

  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch {
    throw new SqlExecutionError("DATABASE_UNAVAILABLE", "The analytics database is not reachable.");
  }

  const started = Date.now();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`);
    await client.query("SET LOCAL search_path = public");

    // Fetch one extra row to know whether the result was cut off.
    // queryMode is supported by pg but missing from @types/pg.
    const query: pg.QueryArrayConfig & { queryMode: "extended" } = {
      text: `SELECT * FROM (${sql}\n) AS shopscope_result LIMIT ${maxRows + 1}`,
      rowMode: "array",
      types: typeParsers,
      // The extended protocol accepts exactly one statement, so SQL like "1) x; DELETE ..." cannot
      // break out of the wrapper into a second statement.
      queryMode: "extended",
    };
    const result = await client.query(query);

    const truncated = result.rows.length > maxRows;
    return {
      fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      rows: truncated ? result.rows.slice(0, maxRows) : result.rows,
      truncated,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    throw toExecutionError(error);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

function toExecutionError(error: unknown): SqlExecutionError {
  const pgError = error as { code?: string; message?: string };
  switch (pgError.code) {
    case "57014": // query_canceled (statement_timeout)
      return new SqlExecutionError("QUERY_TIMEOUT", "The query took too long and was stopped.");
    case "42501": // insufficient_privilege
    case "25006": // read_only_sql_transaction
      return new SqlExecutionError("PERMISSION_DENIED", "The query tried to access data it is not allowed to.");
    default:
      // PostgreSQL's message (e.g. "column x does not exist") helps the model repair its SQL. It contains no secrets.
      return new SqlExecutionError("QUERY_FAILED", pgError.message ?? "The query failed.");
  }
}
