// Decides whether AI-generated SQL may run. Allow-list approach: every node type, table, column,
// function and type cast must be explicitly approved; anything unrecognised is rejected.
// The database's read-only role is the second line of defence, not a replacement for this.

import { getAllowedColumns } from "../analytics/schema.service.js";
import { type AstNode, parseSql, SqlSyntaxError, stringList, walkAst } from "./sql-parser.js";

export type ValidationIssueCode =
  | "EMPTY"
  | "SYNTAX_ERROR"
  | "MULTIPLE_STATEMENTS"
  | "NOT_SELECT"
  | "TABLE_NOT_ALLOWED"
  | "COLUMN_NOT_ALLOWED"
  | "SELECT_STAR"
  | "FUNCTION_NOT_ALLOWED"
  | "CLOCK_FUNCTION"
  | "TYPE_NOT_ALLOWED"
  | "FEATURE_NOT_ALLOWED"
  | "TOO_COMPLEX";

export type ValidationIssue = { code: ValidationIssueCode; message: string };

export type ValidationResult =
  | { ok: true; sql: string; tables: string[] }
  | { ok: false; issues: ValidationIssue[] };

const MAX_NODES = 2_000;

// Parse-tree node types a read-only analytics query may contain. Everything else is rejected.
const ALLOWED_NODE_TYPES = new Set([
  "SelectStmt", "ResTarget", "ColumnRef", "A_Star", "String", "Integer", "Float", "Boolean", "A_Const",
  "A_Expr", "BoolExpr", "NullTest", "BooleanTest", "CaseExpr", "CaseWhen", "CoalesceExpr", "MinMaxExpr",
  "FuncCall", "TypeCast", "List", "SubLink", "RangeVar", "RangeSubselect", "JoinExpr", "SortBy",
  "WindowDef", "WithClause", "CommonTableExpr", "GroupingSet", "SQLValueFunction",
]);

const ALLOWED_FUNCTIONS = new Set([
  // aggregates
  "count", "sum", "avg", "min", "max", "stddev", "stddev_samp", "stddev_pop", "variance",
  "string_agg", "bool_and", "bool_or", "percentile_cont", "percentile_disc", "mode",
  // window functions
  "row_number", "rank", "dense_rank", "percent_rank", "cume_dist", "ntile",
  "lag", "lead", "first_value", "last_value", "nth_value",
  // numbers
  "round", "ceil", "ceiling", "floor", "abs", "trunc", "mod", "power", "sqrt",
  // dates (no clock functions: answers must not depend on when the query runs)
  "date_trunc", "date_part", "extract", "to_char", "make_date", "make_interval", "to_date",
  // text
  "lower", "upper", "initcap", "length", "concat", "concat_ws", "substring", "substr",
  "btrim", "ltrim", "rtrim", "replace", "left", "right", "split_part", "position",
]);

// Rejected with a specific hint, because the model reaches for these for "last month" style questions.
const CLOCK_FUNCTIONS = new Set(["now", "clock_timestamp", "statement_timestamp", "transaction_timestamp", "timeofday", "age"]);
const CLOCK_MESSAGE = "CURRENT_DATE, NOW() and other clock or session functions are not allowed. Use date literals such as DATE '2026-09-01'.";

const ALLOWED_TYPES = new Set([
  "date", "timestamp", "timestamptz", "interval", "int2", "int4", "int8", "integer", "bigint", "smallint",
  "numeric", "decimal", "float4", "float8", "real", "text", "varchar", "bpchar", "bool", "boolean",
]);

// Parser-inserted schema for SQL-syntax functions and built-in types, e.g. EXTRACT -> pg_catalog.extract.
const SYSTEM_SCHEMA = "pg_catalog";

export function validateSql(sql: string, datasetId: string): ValidationResult {
  const trimmed = sql.trim();
  if (!trimmed) return fail("EMPTY", "The SQL is empty.");

  let parsed;
  try {
    parsed = parseSql(trimmed);
  } catch (error) {
    if (error instanceof SqlSyntaxError) return fail("SYNTAX_ERROR", `The SQL has a syntax error: ${error.message}`);
    throw error;
  }

  if (parsed.stmts.length === 0) return fail("EMPTY", "The SQL contains no statement.");
  if (parsed.stmts.length > 1) return fail("MULTIPLE_STATEMENTS", "Only one SQL statement is allowed.");

  const root = parsed.stmts[0]!.stmt;
  if (!("SelectStmt" in root)) return fail("NOT_SELECT", `Only SELECT queries are allowed, not ${statementName(root)}.`);

  const allowedColumns = getAllowedColumns(datasetId);
  const issues = new Map<string, ValidationIssue>();
  const add = (code: ValidationIssueCode, message: string) => issues.set(`${code}:${message}`, { code, message });

  // ---- pass 1: collect names the query defines (CTEs, aliases, output columns) ----
  const cteNames = new Set<string>();
  const derivedNames = new Set<string>(); // CTE names and subquery aliases
  const derivedColumns = new Set<string>(); // column names exposed by CTEs, subqueries and SELECT aliases
  const tableByQualifier = new Map<string, string>(); // alias or table name -> real table
  const referencedTables = new Set<string>();
  let nodeCount = 0;

  walkAst(root, (type, node) => {
    nodeCount++;
    if (type === "CommonTableExpr") {
      const name = node.ctename as string;
      cteNames.add(name);
      derivedNames.add(name);
      for (const col of stringList(node.aliascolnames)) derivedColumns.add(col);
    } else if (type === "RangeSubselect") {
      const alias = node.alias as { aliasname?: string; colnames?: unknown } | undefined;
      if (alias?.aliasname) derivedNames.add(alias.aliasname);
      for (const col of stringList(alias?.colnames)) derivedColumns.add(col);
    } else if (type === "ResTarget" && typeof node.name === "string") {
      derivedColumns.add(node.name);
    }
  });

  if (nodeCount > MAX_NODES) return fail("TOO_COMPLEX", "The query is too complex.");

  walkAst(root, (type, node) => {
    if (type !== "RangeVar") return;
    const name = node.relname as string;
    const alias = (node.alias as { aliasname?: string } | undefined)?.aliasname;
    if (cteNames.has(name) && !node.schemaname) {
      if (alias) derivedNames.add(alias);
      return;
    }
    if (allowedColumns.has(name) && (!node.schemaname || node.schemaname === "public")) {
      referencedTables.add(name);
      tableByQualifier.set(alias ?? name, name);
    }
  });

  // Unqualified columns must belong to a table the query uses, or be a name the query itself defines.
  const columnsInScope = new Set(derivedColumns);
  for (const table of referencedTables) for (const col of allowedColumns.get(table)!) columnsInScope.add(col);
  // Columns of real tables also flow out through CTEs and subqueries under their own names.
  for (const table of referencedTables) for (const col of allowedColumns.get(table)!) derivedColumns.add(col);

  // ---- pass 2: check every node ----
  walkAst(root, (type, node) => {
    if (!ALLOWED_NODE_TYPES.has(type)) {
      if (type.endsWith("Stmt")) add("NOT_SELECT", `Only SELECT queries are allowed, not ${type.replace(/Stmt$/, "").toUpperCase()}.`);
      else add("FEATURE_NOT_ALLOWED", `The SQL feature "${type}" is not allowed.`);
      return;
    }

    switch (type) {
      case "SelectStmt":
        if (node.intoClause) add("NOT_SELECT", "SELECT INTO is not allowed.");
        if (node.lockingClause) add("FEATURE_NOT_ALLOWED", "Row locking (FOR UPDATE / FOR SHARE) is not allowed.");
        break;

      case "CommonTableExpr":
        if (!(node.ctequery && typeof node.ctequery === "object" && "SelectStmt" in node.ctequery)) {
          add("NOT_SELECT", `The WITH query "${String(node.ctename)}" must be a SELECT.`);
        }
        break;

      case "RangeVar": {
        const name = node.relname as string;
        const schema = node.schemaname as string | undefined;
        const isCte = cteNames.has(name) && !schema;
        const isApproved = allowedColumns.has(name) && (!schema || schema === "public");
        if (!isCte && !isApproved) add("TABLE_NOT_ALLOWED", `Table "${schema ? `${schema}.` : ""}${name}" is not available.`);
        break;
      }

      case "ColumnRef":
        checkColumn(node);
        break;

      case "FuncCall": {
        const parts = stringList(node.funcname);
        const name = parts.at(-1)?.toLowerCase() ?? "";
        const schemaOk = parts.length === 1 || (parts.length === 2 && parts[0] === SYSTEM_SCHEMA && node.funcformat === "COERCE_SQL_SYNTAX");
        if (CLOCK_FUNCTIONS.has(name)) add("CLOCK_FUNCTION", CLOCK_MESSAGE);
        else if (!schemaOk || !ALLOWED_FUNCTIONS.has(name)) add("FUNCTION_NOT_ALLOWED", `Function "${parts.join(".")}" is not allowed.`);
        break;
      }

      case "SQLValueFunction":
        add("CLOCK_FUNCTION", CLOCK_MESSAGE);
        break;

      case "TypeCast": {
        const names = stringList((node.typeName as { names?: unknown } | undefined)?.names);
        const typeName = names.at(-1)?.toLowerCase() ?? "";
        const schemaOk = names.length === 1 || (names.length === 2 && names[0] === SYSTEM_SCHEMA);
        if (!schemaOk || !ALLOWED_TYPES.has(typeName)) add("TYPE_NOT_ALLOWED", `Casting to "${names.join(".")}" is not allowed.`);
        break;
      }
    }
  });

  function checkColumn(node: AstNode) {
    const fields = node.fields as unknown[];
    if (fields.some((f) => typeof f === "object" && f !== null && "A_Star" in f)) {
      add("SELECT_STAR", "SELECT * is not allowed. List the columns you need by name.");
      return;
    }
    const parts = stringList(fields);
    if (parts.length === 1) {
      const column = parts[0]!;
      if (!columnsInScope.has(column)) add("COLUMN_NOT_ALLOWED", `Column "${column}" is not available.`);
    } else if (parts.length === 2) {
      const [qualifier, column] = parts as [string, string];
      const table = tableByQualifier.get(qualifier);
      if (table) {
        if (!allowedColumns.get(table)!.has(column)) add("COLUMN_NOT_ALLOWED", `Column "${table}.${column}" is not available.`);
      } else if (derivedNames.has(qualifier)) {
        if (!derivedColumns.has(column)) add("COLUMN_NOT_ALLOWED", `Column "${qualifier}.${column}" is not available.`);
      } else {
        add("COLUMN_NOT_ALLOWED", `"${qualifier}" is not a table or alias in this query.`);
      }
    } else {
      add("COLUMN_NOT_ALLOWED", `Column reference "${parts.join(".")}" is not allowed.`);
    }
  }

  if (issues.size > 0) return { ok: false, issues: [...issues.values()] };
  return { ok: true, sql: trimmed, tables: [...referencedTables].sort() };
}

function fail(code: ValidationIssueCode, message: string): ValidationResult {
  return { ok: false, issues: [{ code, message }] };
}

function statementName(stmt: AstNode): string {
  const type = Object.keys(stmt)[0] ?? "unknown";
  return type.replace(/Stmt$/, "").toUpperCase();
}

// One readable sentence, for the repair prompt and for API error messages.
export function describeIssues(issues: ValidationIssue[]): string {
  return issues.map((issue) => issue.message).join(" ");
}
