import { env } from "./env.js";

export const geminiConfig = {
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  apiKey: env.GEMINI_API_KEY ?? "",
  model: env.GEMINI_MODEL,
  timeoutMs: env.GEMINI_TIMEOUT_MS,
  // Deterministic output, as with the local model.
  temperature: 0,
} as const;
