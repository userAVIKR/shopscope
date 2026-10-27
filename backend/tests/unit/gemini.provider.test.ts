// Gemini request shape and failure modes, with fetch replaced by a fake. No API key or network needed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/config/gemini.js", () => ({
  geminiConfig: { baseUrl: "https://gemini.test/v1beta", apiKey: "test-key", model: "gemini-test-flash", timeoutMs: 1_000, temperature: 0 },
}));

const { chatJson, checkGemini, resetGeminiStatusCache, toGeminiSchema } = await import("../../src/ai/gemini.provider.js");

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);
beforeEach(() => resetGeminiStatusCache());
afterEach(() => fetchMock.mockReset());

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const reply = (text: string, extra: object = {}) =>
  jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], modelVersion: "gemini-test-flash-001", ...extra });

const messages = [
  { role: "system" as const, content: "You write SQL." },
  { role: "user" as const, content: "Revenue?" },
  { role: "assistant" as const, content: "{\"status\":\"ok\"}" },
  { role: "user" as const, content: "Try again" },
];

const format = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { status: { type: "string", enum: ["ok", "cannot_answer"] }, sql: { type: "string" } },
  required: ["status", "sql"],
  additionalProperties: false,
};

describe("toGeminiSchema", () => {
  it("keeps only the fields Gemini accepts and fixes the property order", () => {
    expect(toGeminiSchema(format)).toEqual({
      type: "OBJECT",
      properties: { status: { type: "STRING", enum: ["ok", "cannot_answer"] }, sql: { type: "STRING" } },
      propertyOrdering: ["status", "sql"],
      required: ["status", "sql"],
    });
  });
});

describe("chatJson", () => {
  it("sends the system prompt, conversation and JSON schema; key only in a header", async () => {
    fetchMock.mockResolvedValue(reply("{\"status\":\"ok\",\"sql\":\"SELECT 1\"}"));

    const result = await chatJson(messages, format);

    expect(result).toMatchObject({ content: "{\"status\":\"ok\",\"sql\":\"SELECT 1\"}", model: "gemini-test-flash-001" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://gemini.test/v1beta/models/gemini-test-flash:generateContent");
    expect(String(url)).not.toContain("test-key");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");

    const body = JSON.parse(String(init!.body));
    expect(body.systemInstruction).toEqual({ parts: [{ text: "You write SQL." }] });
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    expect(body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: "application/json" });
    expect(body.generationConfig.responseSchema.type).toBe("OBJECT");
  });

  it("never sends database credentials", async () => {
    fetchMock.mockResolvedValue(reply("{}"));
    await chatJson(messages, format);
    const body = String(fetchMock.mock.calls[0]![1]!.body);
    expect(body).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("ignores the model's internal thinking parts", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ text: "reasoning...", thought: true }, { text: "{\"a\":1}" }] }, finishReason: "STOP" }] }),
    );
    expect((await chatJson(messages, format)).content).toBe("{\"a\":1}");
  });

  it.each([
    ["the network is down", () => Promise.reject(new TypeError("fetch failed")), 503, "MODEL_UNAVAILABLE"],
    ["the request times out", () => Promise.reject(new DOMException("timed out", "TimeoutError")), 504, "MODEL_TIMEOUT"],
    ["the API key is invalid", () => Promise.resolve(jsonResponse({ error: { message: "API key not valid." } }, 400)), 503, "MODEL_AUTH_FAILED"],
    ["the key lacks permission", () => Promise.resolve(jsonResponse({ error: { message: "denied" } }, 403)), 503, "MODEL_AUTH_FAILED"],
    ["the model does not exist", () => Promise.resolve(jsonResponse({ error: { message: "not found" } }, 404)), 503, "MODEL_NOT_FOUND"],
    ["the free limit is reached", () => Promise.resolve(jsonResponse({ error: { message: "quota" } }, 429)), 429, "MODEL_RATE_LIMITED"],
    ["Gemini has a server error", () => Promise.resolve(jsonResponse({ error: { message: "boom" } }, 500)), 502, "MODEL_ERROR"],
    ["the prompt is blocked", () => Promise.resolve(jsonResponse({ promptFeedback: { blockReason: "SAFETY" } })), 502, "MODEL_REFUSED"],
    ["the reply is empty", () => Promise.resolve(reply("")), 502, "INVALID_MODEL_RESPONSE"],
    [
      "the reply was cut off",
      () => Promise.resolve(jsonResponse({ candidates: [{ content: { parts: [{ text: "{\"sq" }] }, finishReason: "MAX_TOKENS" }] })),
      502,
      "INVALID_MODEL_RESPONSE",
    ],
  ])("fails safely when %s", async (_name, fake, status, code) => {
    fetchMock.mockImplementation(fake);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(chatJson(messages, format)).rejects.toMatchObject({ status, code });
  });
});

describe("checkGemini", () => {
  it.each([
    [200, "up"],
    [404, "model_missing"],
    [400, "invalid_key"],
    [403, "invalid_key"],
    [500, "down"],
  ] as const)("maps HTTP %i to %s", async (status, expected) => {
    fetchMock.mockResolvedValue(jsonResponse({}, status));
    expect(await checkGemini()).toBe(expected);
  });

  it("is down when Google cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await checkGemini()).toBe("down");
  });

  it("caches the result so frequent health polls do not call Google each time", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 200));
    await checkGemini();
    await checkGemini();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
