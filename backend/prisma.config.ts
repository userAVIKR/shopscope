import { defineConfig } from "prisma/config";

// The Prisma CLI does not read backend/.env by itself. Missing file is fine when real env vars are set.
try {
  process.loadEnvFile(".env");
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Application database only. Prisma never touches shopscope_analytics.
    url: process.env["APP_DATABASE_URL"],
  },
});
