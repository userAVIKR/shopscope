import { z } from "zod";

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgresql:// URL" });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.url(),

  APP_DATABASE_URL: postgresUrl,
  ANALYTICS_DATABASE_URL: postgresUrl,

  OLLAMA_BASE_URL: z.url(),
  OLLAMA_MODEL: z.string().min(1),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
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
