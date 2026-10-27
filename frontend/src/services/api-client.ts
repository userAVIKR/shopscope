// The only place the frontend talks to the backend. Sends the session cookie,
// turns error responses into ApiError, and checks every response against its schema.
import type { z } from "zod";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(/\/+$/, "");

// Fired on any 401, so the app can send the user back to the login page.
export const UNAUTHORIZED_EVENT = "shopscope:unauthorized";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = { method?: "GET" | "POST" | "DELETE"; body?: unknown; signal?: AbortSignal };

async function send(path: string, options: RequestOptions): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the ShopScope server. Is the backend running?");
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  return new ApiError(
    response.status,
    body?.error?.code ?? "HTTP_ERROR",
    body?.error?.message ?? `Request failed (${response.status})`,
  );
}

export async function apiRequest<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (!response.ok) throw await toApiError(response);

  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    console.error(`Unexpected response from ${path}`, parsed.error);
    throw new ApiError(response.status, "INVALID_RESPONSE", "The server sent an unexpected response.");
  }
  return parsed.data;
}

// For endpoints that answer 204 No Content.
export async function apiRequestNoContent(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await send(path, options);
  if (!response.ok) throw await toApiError(response);
}
