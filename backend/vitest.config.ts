import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Tests against the real AI model are slow; run them with `npm run test:ai`.
    exclude: ["**/node_modules/**", "tests/**/*.ai.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
