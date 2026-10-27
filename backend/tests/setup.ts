// Load backend/.env for tests. Missing file is fine (e.g. CI sets real env vars).
try {
  process.loadEnvFile(".env");
} catch {}
