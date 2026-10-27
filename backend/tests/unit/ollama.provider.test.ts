// Ollama failure modes, with fetch replaced by a fake. No real model needed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatJson, checkOllama } from "../../src/ai/ollama.provider.js";
import { ollamaConfig } from "../../src/config/ollama.js";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const messages = [{ role: "user" as const, content: "hi" }];
const format = { type: "object" };

describe("chatJson", () => {
  it("sends the model, schema and deterministic options, and returns the reply", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: "m", message: { content: "{\"a\":1}" }, done_reason: "stop" }));

    const result = await chatJson(messages, format);

    expect(result.content).toBe("{\"a\":1}");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${ollamaConfig.baseUrl}/api/chat`);
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ model: ollamaConfig.model, format, stream: false, options: { temperature: 0 } });
  });

  it("never sends database credentials", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ model: "m", message: { content: "{}" } }));
    await chatJson(messages, format);
    const body = String(fetchMock.mock.calls[0]![1]!.body);
    expect(body).not.toMatch(/postgres(ql)?:\/\//);
    expect(body).not.toContain(process.env.ANALYTICS_DATABASE_URL);
  });

  it.each([
    ["Ollama is not running", () => Promise.reject(new TypeError("fetch failed")), 503, "MODEL_UNAVAILABLE"],
    ["the request times out", () => Promise.reject(new DOMException("timed out", "TimeoutError")), 504, "MODEL_TIMEOUT"],
    ["the model is not installed", () => Promise.resolve(jsonResponse({ error: "model not found" }, 404)), 503, "MODEL_NOT_FOUND"],
    ["Ollama returns a server error", () => Promise.resolve(jsonResponse({ error: "boom" }, 500)), 502, "MODEL_ERROR"],
    ["the reply is empty", () => Promise.resolve(jsonResponse({ model: "m", message: { content: "" } })), 502, "INVALID_MODEL_RESPONSE"],
    ["the reply was cut off", () => Promise.resolve(jsonResponse({ model: "m", message: { content: "{\"sq" }, done_reason: "length" })), 502, "INVALID_MODEL_RESPONSE"],
  ])("fails safely when %s", async (_name, fake, status, code) => {
    fetchMock.mockImplementation(fake);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(chatJson(messages, format)).rejects.toMatchObject({ status, code });
  });
});

describe("checkOllama", () => {
  it("is up when the configured model is installed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [{ name: ollamaConfig.model }] }));
    expect(await checkOllama()).toBe("up");
  });

  it("reports a missing model", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [{ name: "some-other-model" }] }));
    expect(await checkOllama()).toBe("model_missing");
  });

  it("is down when Ollama cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await checkOllama()).toBe("down");
  });
});
