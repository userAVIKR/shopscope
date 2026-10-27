import { defineConfig } from "vitest/config";

// Runs against the real Ollama model and seeded database: npm run test:ai
export default defineConfig({
  test: {
    include: ["tests/**/*.ai.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 120_000,
    // One model, one request at a time.
    fileParallelism: false,
  },
});
