import { historyPageSchema } from "@/types/api";
import { apiRequest } from "./api-client";

export function listHistory(cursor?: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiRequest(`/history?${params}`, historyPageSchema);
}
