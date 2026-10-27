import pg from "pg";
import { env } from "./env.js";

// Connection pool for the analytics database, using the SELECT-only reader role.
// This is the only path generated SQL may take. The app database uses Prisma (Phase 3).
export const analyticsPool = new pg.Pool({
  connectionString: env.ANALYTICS_DATABASE_URL,
  application_name: "shopscope-api",
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// An idle client losing its connection (e.g. the database restarted) must not crash the server.
analyticsPool.on("error", (error) => {
  console.error("Analytics database pool error:", error.message);
});

export async function pingAnalyticsDatabase(): Promise<boolean> {
  try {
    await analyticsPool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabases(): Promise<void> {
  await analyticsPool.end();
}
