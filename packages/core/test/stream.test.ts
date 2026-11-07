import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAICompatibleProvider } from "../src/providers/openai-compatible.js";

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

const cfg = { id: "test", baseUrl: "http://localhost/v1", models: [] };

test("streams pieces in order and returns the full reply", async () => {
  const fakeFetch = async () =>
    sseResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
  const provider = createOpenAICompatibleProvider(cfg, fakeFetch as typeof fetch);

  const pieces: string[] = [];
  const full = await provider.complete([{ role: "user", content: "hi" }], "m", {}, (t) =>
    pieces.push(t),
  );
  assert.equal(full, "Hello");
  assert.deepEqual(pieces, ["Hel", "lo"]);
});

test("handles a line split across network chunks", async () => {
  const fakeFetch = async () =>
    sseResponse([
      'data: {"choices":[{"del',
      'ta":{"content":"Hi"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
  const provider = createOpenAICompatibleProvider(cfg, fakeFetch as typeof fetch);
  const full = await provider.complete([{ role: "user", content: "hi" }], "m", {}, () => {});
  assert.equal(full, "Hi");
});
