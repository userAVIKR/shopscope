import { env } from "./env.js";

export const ollamaConfig = {
  baseUrl: env.OLLAMA_BASE_URL.replace(/\/+$/, ""),
  model: env.OLLAMA_MODEL,
  timeoutMs: env.OLLAMA_TIMEOUT_MS,
  // Deterministic, focused output. The schema context is ~2.5k characters, so 4k tokens leaves room for the answer.
  options: {
    temperature: 0,
    num_ctx: 4096,
  },
  // Keep the model loaded between questions so only the first one pays the load time.
  keepAlive: "10m",
} as const;
