import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

const valid = {
  FRONTEND_ORIGIN: "http://localhost:3000",
  APP_DATABASE_URL: "postgresql://user:pw@localhost:5433/shopscope_app",
  ANALYTICS_DATABASE_URL: "postgresql://reader:pw@localhost:5433/shopscope_analytics",
  OLLAMA_BASE_URL: "http://localhost:11434",
  OLLAMA_MODEL: "qwen2.5-coder:3b",
  SESSION_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a valid configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.OLLAMA_TIMEOUT_MS).toBe(60_000);
  });

  it("converts numeric strings", () => {
    expect(parseEnv({ ...valid, PORT: "8080" }).PORT).toBe(8080);
  });

  it.each([
    ["missing database URL", { ANALYTICS_DATABASE_URL: undefined }, "ANALYTICS_DATABASE_URL"],
    ["non-postgres database URL", { APP_DATABASE_URL: "mysql://u:p@localhost/db" }, "APP_DATABASE_URL"],
    ["short session secret", { SESSION_SECRET: "too-short" }, "SESSION_SECRET"],
    ["invalid port", { PORT: "99999" }, "PORT"],
    ["unknown NODE_ENV", { NODE_ENV: "staging" }, "NODE_ENV"],
  ])("rejects %s", (_name, override, field) => {
    expect(() => parseEnv({ ...valid, ...override })).toThrow(field);
  });
});
