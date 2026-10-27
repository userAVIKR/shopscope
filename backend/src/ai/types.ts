// Shared by every AI provider. Only prompt text crosses this boundary: no credentials, no data rows.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  content: string;
  model: string;
  durationMs: number;
};

// For the health check. "invalid_key" only applies to hosted providers.
export type ModelStatus = "up" | "down" | "model_missing" | "invalid_key";
