import { healthSchema, queryResponseSchema, type Health, type QueryResponse } from "@/types/api";
import { API_URL, apiRequest } from "./api-client";

export const askQuestion = (question: string, signal?: AbortSignal): Promise<QueryResponse> =>
  apiRequest("/queries", queryResponseSchema, { method: "POST", body: { question }, signal });

// /health answers 503 when degraded, but the body is still useful, so read it either way.
export async function getHealth(): Promise<Health | null> {
  try {
    const response = await fetch(`${API_URL}/health`, { credentials: "include" });
    const parsed = healthSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
