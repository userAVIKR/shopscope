// The approved view of the analytics database. Only what is listed here is shown to the AI
// and allowed by the SQL validator; anything else in the database is invisible to ShopScope.

import type pg from "pg";
import { HttpError } from "../utils/http-error.js";
import { BUSINESS_RULES, METRICS } from "./metrics.js";

export type ColumnType = "integer" | "text" | "numeric" | "date" | "timestamptz" | "boolean";

export type ColumnDefinition = {
  name: string;
  type: ColumnType;
  description: string;
  primaryKey?: boolean;
  // Allowed values, for columns with a fixed set.
  values?: readonly string[];
  // Personal data: hidden from the AI and rejected by the SQL validator.
  sensitive?: boolean;
};

export type TableDefinition = { name: string; description: string; columns: readonly ColumnDefinition[] };
export type ColumnRef = { table: string; column: string };
export type JoinDefinition = { from: ColumnRef; to: ColumnRef };

export type Dataset = {
  id: string;
  name: string;
  description: string;
  tables: readonly TableDefinition[];
  joins: readonly JoinDefinition[];
};

const SALES_DATASET: Dataset = {
  id: "sales",
  name: "Sales",
  description: "Fictional Indian e-commerce store: customers, products, orders and order items.",
  tables: [
    {
      name: "customers",
      description: "People who have an account with the store",
      columns: [
        { name: "id", type: "integer", description: "Customer id", primaryKey: true },
        { name: "name", type: "text", description: "Full name", sensitive: true },
        { name: "city", type: "text", description: "Indian city the customer lives in" },
        { name: "created_at", type: "timestamptz", description: "When the customer signed up" },
      ],
    },
    {
      name: "categories",
      description: "Product categories, e.g. Electronics, Grocery",
      columns: [
        { name: "id", type: "integer", description: "Category id", primaryKey: true },
        { name: "name", type: "text", description: "Category name" },
      ],
    },
    {
      name: "products",
      description: "Items for sale",
      columns: [
        { name: "id", type: "integer", description: "Product id", primaryKey: true },
        { name: "name", type: "text", description: "Product name" },
        { name: "category_id", type: "integer", description: "Category of the product" },
        { name: "unit_price", type: "numeric", description: "Current list price in INR" },
        { name: "active", type: "boolean", description: "false = discontinued, no longer sold" },
      ],
    },
    {
      name: "orders",
      description: "One checkout by one customer",
      columns: [
        { name: "id", type: "integer", description: "Order id", primaryKey: true },
        { name: "customer_id", type: "integer", description: "Customer who placed the order" },
        { name: "status", type: "text", description: "Order status", values: ["pending", "paid", "shipped", "delivered", "cancelled"] },
        { name: "order_date", type: "date", description: "Date the order was placed" },
      ],
    },
    {
      name: "order_items",
      description: "Line items: which products, how many, at what price",
      columns: [
        { name: "id", type: "integer", description: "Line item id", primaryKey: true },
        { name: "order_id", type: "integer", description: "Order this line belongs to" },
        { name: "product_id", type: "integer", description: "Product bought" },
        { name: "quantity", type: "integer", description: "Units bought" },
        { name: "unit_price", type: "numeric", description: "Price paid per unit in INR at the time of the order" },
      ],
    },
  ],
  joins: [
    { from: { table: "orders", column: "customer_id" }, to: { table: "customers", column: "id" } },
    { from: { table: "order_items", column: "order_id" }, to: { table: "orders", column: "id" } },
    { from: { table: "order_items", column: "product_id" }, to: { table: "products", column: "id" } },
    { from: { table: "products", column: "category_id" }, to: { table: "categories", column: "id" } },
  ],
};

const DATASETS: readonly Dataset[] = [SALES_DATASET];
export const DEFAULT_DATASET_ID = SALES_DATASET.id;

export function listDatasets() {
  return DATASETS.map(({ id, name, description }) => ({ id, name, description }));
}

export function getDataset(id: string): Dataset {
  const dataset = DATASETS.find((d) => d.id === id);
  if (!dataset) throw new HttpError(404, "DATASET_NOT_FOUND", `Dataset "${id}" does not exist`);
  return dataset;
}

// The schema with sensitive columns removed. This is all the AI and the API ever reveal.
export function getPublicSchema(datasetId: string) {
  const dataset = getDataset(datasetId);
  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    tables: dataset.tables.map((table) => ({
      ...table,
      columns: table.columns.filter((column) => !column.sensitive),
    })),
    joins: dataset.joins,
    metrics: METRICS.map(({ id, name, description, unit }) => ({ id, name, description, unit })),
  };
}

// table name -> approved column names. Used by the SQL validator.
export function getAllowedColumns(datasetId: string): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map(
    getPublicSchema(datasetId).tables.map((table) => [table.name, new Set(table.columns.map((c) => c.name))]),
  );
}

export function getAllowedJoins(datasetId: string): readonly JoinDefinition[] {
  return getDataset(datasetId).joins;
}

export type ModelContextOptions = {
  // Today's date as YYYY-MM-DD, so relative dates like "last month" can be resolved.
  today: string;
  // First and last order dates in the data, from getDataCoverage().
  coverage?: { from: string; to: string };
};

// Compact plain-text description of the schema for the AI prompt. Small models do best with short context.
export function buildModelContext(datasetId: string, options: ModelContextOptions): string {
  const schema = getPublicSchema(datasetId);

  const tables = schema.tables.map((table) => {
    const columns = table.columns.map((c) => {
      const notes = [c.primaryKey ? "primary key" : "", c.values ? `one of: ${c.values.join(", ")}` : ""].filter(Boolean);
      return `  ${c.name} ${c.type}${notes.length ? ` (${notes.join("; ")})` : ""} — ${c.description}`;
    });
    return `${table.name}: ${table.description}\n${columns.join("\n")}`;
  });

  const joins = schema.joins.map((j) => `- ${j.from.table}.${j.from.column} = ${j.to.table}.${j.to.column}`);
  const metrics = METRICS.map((m) => `- ${m.id}: ${m.expression} WHERE ${m.filter}`);

  return [
    `Dataset: ${schema.name}. ${schema.description} Database: PostgreSQL.`,
    `Today's date: ${options.today}.` +
      (options.coverage ? ` Orders in the data range from ${options.coverage.from} to ${options.coverage.to}.` : ""),
    "",
    "Tables (only these tables and columns exist):",
    tables.join("\n\n"),
    "",
    "Allowed joins:",
    joins.join("\n"),
    "",
    "Metric definitions (always use these exact formulas):",
    metrics.join("\n"),
    "",
    "Rules:",
    BUSINESS_RULES.map((rule) => `- ${rule}`).join("\n"),
  ].join("\n");
}

export async function getDataCoverage(pool: pg.Pool): Promise<{ from: string; to: string }> {
  const { rows } = await pool.query<{ from: string; to: string }>(
    "SELECT min(order_date)::text AS from, max(order_date)::text AS to FROM orders",
  );
  return rows[0]!;
}

// PostgreSQL's internal type names (pg_type.typname).
const POSTGRES_TYPES: Record<ColumnType, string> = {
  integer: "int4",
  text: "text",
  numeric: "numeric",
  date: "date",
  timestamptz: "timestamptz",
  boolean: "bool",
};

// Compares the approved definitions with the real database and lists every mismatch.
// Catches drift such as a renamed column that the AI would otherwise be told exists.
export async function verifySchemaAgainstDatabase(pool: pg.Pool, datasetId: string): Promise<string[]> {
  // pg_catalog, not information_schema: the latter hides columns the reader may not SELECT.
  const { rows } = await pool.query<{ table_name: string; column_name: string; type: string }>(`
    SELECT c.relname AS table_name, a.attname AS column_name, t.typname AS type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  `);
  const actual = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r.type]));

  const problems: string[] = [];
  for (const table of getDataset(datasetId).tables) {
    for (const column of table.columns) {
      const key = `${table.name}.${column.name}`;
      const type = actual.get(key);
      if (!type) problems.push(`${key} is defined but missing from the database`);
      else if (type !== POSTGRES_TYPES[column.type]) problems.push(`${key} is ${type} in the database, expected ${POSTGRES_TYPES[column.type]}`);
    }
  }
  return problems;
}
