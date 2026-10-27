// Parses SQL with PostgreSQL's own parser (libpg-query, compiled to WebAssembly),
// so the validator sees exactly what the database would execute.

import { loadModule, parseSync } from "libpg-query";

await loadModule();

// The parser's JSON tree. Every node is an object with one key naming its type, e.g. { "SelectStmt": {...} }.
export type AstNode = Record<string, unknown>;
export type ParsedSql = { stmts: { stmt: AstNode }[] };

export class SqlSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlSyntaxError";
  }
}

export function parseSql(sql: string): ParsedSql {
  try {
    const result = parseSync(sql) as { stmts?: { stmt: AstNode }[] };
    return { stmts: result.stmts ?? [] };
  } catch (error) {
    throw new SqlSyntaxError(error instanceof Error ? error.message : "Invalid SQL");
  }
}

// Calls `visit` for every node in the tree, depth first. Node wrappers are the keys starting with a capital letter.
export function walkAst(value: unknown, visit: (type: string, node: AstNode) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkAst(item, visit);
    return;
  }
  if (value === null || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (/^[A-Z]/.test(key) && child !== null && typeof child === "object" && !Array.isArray(child)) {
      visit(key, child as AstNode);
    }
    walkAst(child, visit);
  }
}

// Reads the plain strings out of a list like [{ String: { sval: "orders" } }, ...].
export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (item as { String?: { sval?: string } })?.String?.sval ?? "").filter(Boolean);
}
