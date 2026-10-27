import { z } from "zod";

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgresql:// URL" });

// An empty line like `GEMINI_API_KEY=` in .env counts as not set.
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const envSchema = z
  .object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.url(),

  APP_DATABASE_URL: postgresUrl,
  ANALYTICS_DATABASE_URL: postgresUrl,

  // Which AI writes the SQL: "ollama" (local, offline) or "gemini" (Google's hosted API).
  LLM_PROVIDER: z.enum(["ollama", "gemini"]).default("ollama"),

  OLLAMA_BASE_URL: z.url(),
  OLLAMA_MODEL: z.string().min(1),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  })
  .superRefine((value, ctx) => {
    if (value.LLM_PROVIDER === "gemini" && !value.GEMINI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "is required when LLM_PROVIDER=gemini" });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Validated once at startup: a missing or malformed setting stops the server immediately.
export const env = parseEnv(process.env);
