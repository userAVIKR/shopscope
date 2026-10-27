// Picks the AI provider from LLM_PROVIDER in .env. Everything else in the app uses only this module,
// so switching between the local model and Gemini changes nothing downstream: the SQL is validated the same way.

import { env } from "../config/env.js";
import { geminiConfig } from "../config/gemini.js";
import { ollamaConfig } from "../config/ollama.js";
import * as gemini from "./gemini.provider.js";
import * as ollama from "./ollama.provider.js";
import type { ChatMessage, ChatResult, ModelStatus } from "./types.js";

export type { ChatMessage } from "./types.js";

const provider = env.LLM_PROVIDER === "gemini" ? { chatJson: gemini.chatJson, check: gemini.checkGemini } : { chatJson: ollama.chatJson, check: ollama.checkOllama };

export const modelInfo = {
  provider: env.LLM_PROVIDER,
  model: env.LLM_PROVIDER === "gemini" ? geminiConfig.model : ollamaConfig.model,
} as const;

export function chatJson(messages: ChatMessage[], format: object): Promise<ChatResult> {
  return provider.chatJson(messages, format);
}

export function checkModel(): Promise<ModelStatus> {
  return provider.check();
}
