// Talks to Google's hosted Gemini API. Only the prompt text is sent (question + table descriptions):
// never database credentials or data rows. The API key travels in a header, never in a URL or log.

import { geminiConfig } from "../config/gemini.js";
import { HttpError } from "../utils/http-error.js";
import type { ChatMessage, ChatResult, ModelStatus } from "./types.js";

type GeminiPart = { text?: string; thought?: boolean };

type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
};

type JsonSchema = {
  type?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  description?: string;
};

// Gemini accepts an OpenAPI-style subset of JSON Schema. Keep only the fields it understands
// (dropping $schema, additionalProperties, ...) and fix the property order so replies are stable.
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (schema.type) result.type = schema.type.toUpperCase();
  if (schema.description) result.description = schema.description;
  if (schema.enum) result.enum = schema.enum;
  if (schema.items) result.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    result.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    result.propertyOrdering = Object.keys(schema.properties);
  }
  if (schema.required) result.required = schema.required;
  return result;
}

// System messages become Gemini's systemInstruction; "assistant" turns are called "model".
function toGeminiRequest(messages: ChatMessage[], format: object) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  return {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents: messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: {
      temperature: geminiConfig.temperature,
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(format as JsonSchema),
    },
  };
}

function modelUrl(suffix = "") {
  return `${geminiConfig.baseUrl}/models/${encodeURIComponent(geminiConfig.model)}${suffix}`;
}

const headers = () => ({ "Content-Type": "application/json", "x-goog-api-key": geminiConfig.apiKey });

// Sends a chat request and forces the reply to match `format` (a JSON Schema).
export async function chatJson(messages: ChatMessage[], format: object): Promise<ChatResult> {
  if (!geminiConfig.apiKey) {
    throw new HttpError(503, "MODEL_AUTH_FAILED", "No Gemini API key is configured. Set GEMINI_API_KEY in backend/.env.");
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(modelUrl(":generateContent"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(toGeminiRequest(messages, format)),
      signal: AbortSignal.timeout(geminiConfig.timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new HttpError(504, "MODEL_TIMEOUT", "The AI model took too long to respond. Please try again.");
    }
    throw new HttpError(503, "MODEL_UNAVAILABLE", "The Gemini API is not reachable. Check your internet connection.");
  }

  if (!response.ok) throw await toHttpError(response);

  const data = (await response.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new HttpError(502, "MODEL_REFUSED", "The AI model declined to answer this question.");
  }

  const candidate = data.candidates?.[0];
  // Thinking models may include their reasoning as separate "thought" parts; only the answer counts.
  const content = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new HttpError(502, "INVALID_MODEL_RESPONSE", "The AI model's answer was cut off.");
  }
  if (!content) throw new HttpError(502, "INVALID_MODEL_RESPONSE", "The AI model returned an empty response.");

  return { content, model: data.modelVersion ?? geminiConfig.model, durationMs: Date.now() - started };
}

async function toHttpError(response: Response): Promise<HttpError> {
  const body = await response.text().catch(() => "");
  const message = (() => {
    try {
      return String((JSON.parse(body) as { error?: { message?: string } }).error?.message ?? "");
    } catch {
      return "";
    }
  })();

  if (response.status === 401 || response.status === 403 || (response.status === 400 && /api key/i.test(message))) {
    return new HttpError(503, "MODEL_AUTH_FAILED", "The Gemini API key is missing or invalid.");
  }
  if (response.status === 404) {
    return new HttpError(503, "MODEL_NOT_FOUND", `The Gemini model "${geminiConfig.model}" does not exist. Run "npm run ai:models" to list available models.`);
  }
  if (response.status === 429) {
    return new HttpError(429, "MODEL_RATE_LIMITED", "The AI service's free limit was reached. Wait a minute and try again.");
  }
  console.error(`Gemini returned ${response.status}: ${message || body.slice(0, 500)}`);
  return new HttpError(502, "MODEL_ERROR", "The AI model returned an error.");
}

// The header polls /health regularly; checking Gemini once a minute is plenty.
const STATUS_TTL_MS = 60_000;
let statusCache: { value: ModelStatus; expiresAt: number } | undefined;

// For the health check: is the key valid, and does the configured model exist? Uses no generation quota.
export async function checkGemini(): Promise<ModelStatus> {
  if (statusCache && statusCache.expiresAt > Date.now()) return statusCache.value;

  let value: ModelStatus;
  if (!geminiConfig.apiKey) {
    value = "invalid_key";
  } else {
    try {
      const response = await fetch(modelUrl(), { headers: headers(), signal: AbortSignal.timeout(3_000) });
      if (response.ok) value = "up";
      else if (response.status === 404) value = "model_missing";
      else if ([400, 401, 403].includes(response.status)) value = "invalid_key";
      else value = "down";
    } catch {
      value = "down";
    }
  }

  statusCache = { value, expiresAt: Date.now() + STATUS_TTL_MS };
  return value;
}

export function resetGeminiStatusCache() {
  statusCache = undefined;
}
