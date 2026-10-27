// Load backend/.env for tests. Missing file is fine (e.g. CI sets real env vars).
process.env.NODE_ENV = "test";
try {
  process.loadEnvFile(".env");
} catch {}
