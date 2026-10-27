// Attacks the validator must block, and legitimate analytics queries it must allow.
import { describe, expect, it } from "vitest";
import { describeIssues, validateSql, type ValidationIssueCode } from "../../src/sql/sql-validator.js";

const validate = (sql: string) => validateSql(sql, "sales");

describe("blocks attacks", () => {
  it.each<[string, string, ValidationIssueCode]>([
    // writes and schema changes
    ["DELETE", "DELETE FROM orders", "NOT_SELECT"],
    ["UPDATE", "UPDATE products SET unit_price = 1", "NOT_SELECT"],
    ["INSERT", "INSERT INTO categories (name) VALUES ('x')", "NOT_SELECT"],
    ["DROP", "DROP TABLE customers", "NOT_SELECT"],
    ["TRUNCATE", "TRUNCATE orders", "NOT_SELECT"],
    ["ALTER", "ALTER TABLE orders ADD COLUMN x int", "NOT_SELECT"],
    ["CREATE TABLE AS", "CREATE TABLE copy AS SELECT id FROM orders", "NOT_SELECT"],
    ["GRANT", "GRANT SELECT ON orders TO PUBLIC", "NOT_SELECT"],
    ["COPY to file", "COPY orders TO '/tmp/orders.csv'", "NOT_SELECT"],
    ["DO block", "DO $$ BEGIN DELETE FROM orders; END $$", "NOT_SELECT"],
    ["PREPARE", "PREPARE p AS DELETE FROM orders", "NOT_SELECT"],
    ["EXPLAIN ANALYZE of a write", "EXPLAIN ANALYZE DELETE FROM orders", "NOT_SELECT"],
    ["SET timeout off", "SET statement_timeout = 0", "NOT_SELECT"],
    ["transaction control", "COMMIT", "NOT_SELECT"],
    ["NOTIFY", "NOTIFY channel, 'hi'", "NOT_SELECT"],
    ["comment-prefixed DELETE", "/* report */ DELETE FROM orders", "NOT_SELECT"],
    ["data-modifying CTE", "WITH gone AS (DELETE FROM orders RETURNING id) SELECT id FROM gone", "NOT_SELECT"],
    ["SELECT INTO a new table", "SELECT id INTO stolen FROM orders", "NOT_SELECT"],

    // stacked statements
    ["SELECT then DELETE", "SELECT 1; DELETE FROM orders", "MULTIPLE_STATEMENTS"],
    ["two SELECTs", "SELECT 1; SELECT 2", "MULTIPLE_STATEMENTS"],
    ["DROP hidden after a comment", "SELECT id FROM orders; -- totals\nDROP TABLE orders", "MULTIPLE_STATEMENTS"],

    // tables outside the approved schema
    ["system catalog", "SELECT usename FROM pg_catalog.pg_user", "TABLE_NOT_ALLOWED"],
    ["password hashes", "SELECT passwd FROM pg_shadow", "TABLE_NOT_ALLOWED"],
    ["information_schema", "SELECT table_name FROM information_schema.tables", "TABLE_NOT_ALLOWED"],
    ["unknown table", "SELECT id FROM secret_table", "TABLE_NOT_ALLOWED"],
    ["approved table in another schema", "SELECT id FROM other_schema.orders", "TABLE_NOT_ALLOWED"],
    ["catalog in a subquery", "SELECT id FROM orders WHERE id IN (SELECT usesysid FROM pg_user)", "TABLE_NOT_ALLOWED"],

    // columns: sensitive, unknown, wildcard
    ["sensitive column", "SELECT name FROM customers", "COLUMN_NOT_ALLOWED"],
    ["sensitive column, qualified", "SELECT customers.name FROM customers", "COLUMN_NOT_ALLOWED"],
    ["sensitive column via alias", "SELECT c.name FROM customers c", "COLUMN_NOT_ALLOWED"],
    ["sensitive column inside a subquery", "SELECT x.name FROM (SELECT name FROM customers) x", "COLUMN_NOT_ALLOWED"],
    ["sensitive column in WHERE", "SELECT id FROM customers WHERE name LIKE 'A%'", "COLUMN_NOT_ALLOWED"],
    ["made-up column", "SELECT secret FROM orders", "COLUMN_NOT_ALLOWED"],
    ["unknown qualifier", "SELECT x.id FROM orders", "COLUMN_NOT_ALLOWED"],
    ["SELECT *", "SELECT * FROM orders", "SELECT_STAR"],
    ["table.*", "SELECT o.* FROM orders o", "SELECT_STAR"],

    // dangerous functions
    ["sleep (denial of service)", "SELECT pg_sleep(10)", "FUNCTION_NOT_ALLOWED"],
    ["schema-qualified sleep", "SELECT pg_catalog.pg_sleep(1)", "FUNCTION_NOT_ALLOWED"],
    ["read server files", "SELECT pg_read_file('/etc/passwd')", "FUNCTION_NOT_ALLOWED"],
    ["large object import", "SELECT lo_import('/etc/passwd')", "FUNCTION_NOT_ALLOWED"],
    ["read settings", "SELECT current_setting('data_directory')", "FUNCTION_NOT_ALLOWED"],
    ["change settings", "SELECT set_config('statement_timeout', '0', false)", "FUNCTION_NOT_ALLOWED"],
    ["server version", "SELECT version()", "FUNCTION_NOT_ALLOWED"],
    ["remote connection", "SELECT dblink('host=evil.example', 'SELECT 1')", "FUNCTION_NOT_ALLOWED"],
    ["huge generated series", "SELECT g FROM generate_series(1, 1000000000) AS g", "FEATURE_NOT_ALLOWED"],

    // clock and session values
    ["CURRENT_DATE", "SELECT id FROM orders WHERE order_date > CURRENT_DATE", "CLOCK_FUNCTION"],
    ["NOW()", "SELECT now()", "CLOCK_FUNCTION"],
    ["CURRENT_USER", "SELECT CURRENT_USER", "CLOCK_FUNCTION"],

    // casts and parameters
    ["cast to regclass", "SELECT 'orders'::regclass", "TYPE_NOT_ALLOWED"],
    ["bind parameter", "SELECT id FROM orders WHERE id = $1", "FEATURE_NOT_ALLOWED"],

    // malformed input
    ["syntax error", "SELEC id FROM orders", "SYNTAX_ERROR"],
    ["empty", "   ", "EMPTY"],
  ])("%s", (_name, sql, code) => {
    const result = validate(sql);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.code)).toContain(code);
  });
});

describe("allows legitimate analytics queries", () => {
  it.each([
    // Written by qwen2.5-coder:3b in Phase 5
    [
      "top categories by revenue",
      "SELECT categories.name AS category, ROUND(SUM(order_items.quantity * order_items.unit_price), 2) AS revenue FROM order_items JOIN orders ON order_items.order_id = orders.id JOIN products ON order_items.product_id = products.id JOIN categories ON products.category_id = categories.id WHERE orders.status <> 'cancelled' AND orders.order_date >= DATE '2025-01-01' AND orders.order_date < DATE '2026-01-01' GROUP BY categories.name ORDER BY revenue DESC LIMIT 5",
    ],
    [
      "cancelled orders per month with EXTRACT",
      "SELECT EXTRACT(MONTH FROM orders.order_date) AS month, COUNT(*) AS cancelled_order_count FROM orders WHERE orders.status = 'cancelled' AND orders.order_date >= DATE '2026-01-01' AND orders.order_date < DATE '2027-01-01' GROUP BY month ORDER BY month LIMIT 100",
    ],
    [
      "order count in a date range",
      "SELECT COUNT(DISTINCT orders.id) AS order_count FROM orders WHERE orders.status <> 'cancelled' AND orders.order_date >= DATE '2026-07-01' AND orders.order_date < DATE '2026-10-01'",
    ],
    // Other common shapes
    ["table aliases", "SELECT o.id, c.city FROM orders o JOIN customers c ON o.customer_id = c.id LIMIT 10"],
    [
      "CTE with date_trunc",
      "WITH monthly AS (SELECT date_trunc('month', order_date) AS month, COUNT(*) AS orders FROM orders WHERE status <> 'cancelled' GROUP BY 1) SELECT month, orders FROM monthly ORDER BY month",
    ],
    [
      "subquery in FROM",
      "SELECT t.city, t.customers FROM (SELECT city, COUNT(*) AS customers FROM customers GROUP BY city) t ORDER BY t.customers DESC LIMIT 5",
    ],
    [
      "window function",
      "SELECT products.name, SUM(order_items.quantity) AS units, RANK() OVER (ORDER BY SUM(order_items.quantity) DESC) AS position FROM order_items JOIN products ON products.id = order_items.product_id GROUP BY products.name LIMIT 10",
    ],
    [
      "CASE, COALESCE, IN, BETWEEN, interval and casts",
      "SELECT CASE WHEN status IN ('shipped', 'delivered') THEN 'sent' ELSE 'not sent' END AS stage, COALESCE(COUNT(id), 0) AS n, MIN(order_date)::text AS first FROM orders WHERE order_date BETWEEN DATE '2026-01-01' AND DATE '2026-03-31' + INTERVAL '1 day' GROUP BY 1",
    ],
    ["UNION", "SELECT city AS label FROM customers UNION SELECT name FROM categories"],
    ["to_char month labels", "SELECT to_char(order_date, 'YYYY-MM') AS month, COUNT(*) AS orders FROM orders GROUP BY 1 ORDER BY 1"],
    ["non-sensitive name columns", "SELECT products.name AS product, categories.name AS category FROM products JOIN categories ON categories.id = products.category_id"],
  ])("%s", (_name, sql) => {
    const result = validate(sql);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it("reports which approved tables a query uses", () => {
    const result = validate("SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id");
    expect(result).toMatchObject({ ok: true, tables: ["order_items", "orders"] });
  });
});

describe("error messages", () => {
  it("explain every problem so the model can repair its SQL", () => {
    const result = validate("SELECT name, now() FROM customers");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const message = describeIssues(result.issues);
    expect(message).toContain('Column "name" is not available');
    expect(message).toContain("Use date literals");
  });
});
