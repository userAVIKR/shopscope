// Proves the database permission boundaries from docker-compose + init script.
// Requires: docker compose up -d --wait && npm run db:seed
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function urlFor(variable: string, database?: string): string {
  const value = process.env[variable];
  if (!value) throw new Error(`${variable} is not set`);
  const url = new URL(value);
  if (database) url.pathname = `/${database}`;
  return url.toString();
}

async function canConnect(connectionString: string): Promise<boolean> {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

describe("analytics reader role", () => {
  const reader = new pg.Client({ connectionString: urlFor("ANALYTICS_DATABASE_URL") });

  beforeAll(() => reader.connect());
  afterAll(() => reader.end());

  it("can read the seeded analytics tables", async () => {
    const { rows } = await reader.query(`
      SELECT (SELECT count(*)::int FROM customers)  AS customers,
             (SELECT count(*)::int FROM categories) AS categories,
             (SELECT count(*)::int FROM products)   AS products,
             (SELECT count(*)::int FROM orders)     AS orders
    `);
    expect(rows[0]).toEqual({ customers: 500, categories: 10, products: 100, orders: 5000 });
  });

  it.each([
    ["INSERT", "INSERT INTO categories (name) VALUES ('Hacked')"],
    ["UPDATE", "UPDATE products SET unit_price = 1"],
    ["DELETE", "DELETE FROM orders"],
    ["TRUNCATE", "TRUNCATE order_items"],
    ["DROP", "DROP TABLE customers"],
    ["ALTER", "ALTER TABLE orders ADD COLUMN hacked int"],
    ["CREATE TABLE", "CREATE TABLE hacked (id int)"],
  ])("is denied %s even with read-only mode switched off", async (_name, sql) => {
    // Session defaults can be changed by the caller, so prove privileges alone block writes.
    await reader.query("BEGIN READ WRITE");
    try {
      await expect(reader.query(sql)).rejects.toThrow(/permission denied|must be owner/);
    } finally {
      await reader.query("ROLLBACK");
    }
  });

  it("cannot pass its access on to other roles", async () => {
    // Without grant option PostgreSQL only warns on GRANT, so check the privilege itself.
    const { rows } = await reader.query(
      "SELECT has_table_privilege('shopscope_reader', 'orders', 'SELECT WITH GRANT OPTION') AS can_grant",
    );
    expect(rows[0].can_grant).toBe(false);
  });

  it("starts sessions read-only with a 5 second statement timeout", async () => {
    const readOnly = await reader.query("SHOW default_transaction_read_only");
    const timeout = await reader.query("SHOW statement_timeout");
    expect(readOnly.rows[0].default_transaction_read_only).toBe("on");
    expect(timeout.rows[0].statement_timeout).toBe("5s");
  });

  it("cannot connect to the application or system databases", async () => {
    expect(await canConnect(urlFor("ANALYTICS_DATABASE_URL", "shopscope_app"))).toBe(false);
    expect(await canConnect(urlFor("ANALYTICS_DATABASE_URL", "postgres"))).toBe(false);
  });
});

describe("application role", () => {
  it("connects to the application database", async () => {
    expect(await canConnect(urlFor("APP_DATABASE_URL"))).toBe(true);
  });

  it("cannot connect to the analytics database", async () => {
    expect(await canConnect(urlFor("APP_DATABASE_URL", "shopscope_analytics"))).toBe(false);
  });
});
