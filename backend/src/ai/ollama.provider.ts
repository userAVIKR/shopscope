// Talks to the local Ollama server. Only the prompt text is sent: no credentials, no database access.

import { ollamaConfig } from "../config/ollama.js";
import { HttpError } from "../utils/http-error.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  content: string;
  model: string;
  durationMs: number;
};

type OllamaChatResponse = {
  model: string;
  message?: { content?: string };
  done_reason?: string;
  total_duration?: number;
};

// Sends a chat request and forces the reply to match `format` (a JSON Schema).
export async function chatJson(messages: ChatMessage[], format: object): Promise<ChatResult> {
  const started = Date.now();
  let response: Response;

  try {
    response = await fetch(`${ollamaConfig.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaConfig.model,
        messages,
        format,
        stream: false,
        options: ollamaConfig.options,
        keep_alive: ollamaConfig.keepAlive,
      }),
      signal: AbortSignal.timeout(ollamaConfig.timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new HttpError(504, "MODEL_TIMEOUT", "The AI model took too long to respond. Please try again.");
    }
    throw new HttpError(503, "MODEL_UNAVAILABLE", "The AI model is not reachable. Is Ollama running?");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 404) {
      throw new HttpError(503, "MODEL_NOT_FOUND", `The AI model "${ollamaConfig.model}" is not installed in Ollama.`);
    }
    console.error(`Ollama returned ${response.status}: ${body.slice(0, 500)}`);
    throw new HttpError(502, "MODEL_ERROR", "The AI model returned an error.");
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.message?.content;
  if (!content) throw new HttpError(502, "INVALID_MODEL_RESPONSE", "The AI model returned an empty response.");
  // "length" means the answer was cut off, so the JSON is incomplete.
  if (data.done_reason === "length") {
    throw new HttpError(502, "INVALID_MODEL_RESPONSE", "The AI model's answer was cut off.");
  }

  return { content, model: data.model, durationMs: Date.now() - started };
}

export type OllamaStatus = "up" | "down" | "model_missing";

// For the health check: is Ollama running, and is the configured model installed?
export async function checkOllama(): Promise<OllamaStatus> {
  try {
    const response = await fetch(`${ollamaConfig.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return "down";
    const { models = [] } = (await response.json()) as { models?: { name: string }[] };
    return models.some((m) => m.name === ollamaConfig.model) ? "up" : "model_missing";
  } catch {
    return "down";
  }
}
