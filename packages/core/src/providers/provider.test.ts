import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createOpenAICompatibleProvider, ProviderError } from "../src/providers/openai-compatible.js";

async function withFakeServer(
  respond: (req: IncomingMessage, body: any, res: ServerResponse) => void,
  fn: (baseUrl: string) => Promise<void>,
) {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => respond(req, raw ? JSON.parse(raw) : undefined, res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  try {
    await fn(`http://127.0.0.1:${port}/v1`);
  } finally {
    server.close();
  }
}

test("sends a chat request and returns the reply", async () => {
  let seen: any;
  await withFakeServer(
    (req, body, res) => {
      seen = { path: req.url, auth: req.headers.authorization, body };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "hello there" } }] }));
    },
    async (baseUrl) => {
      const p = createOpenAICompatibleProvider({ id: "test", baseUrl, apiKey: "sk-1", models: [] });
      const out = await p.complete([{ role: "user", content: "hi" }], "m1", { temperature: 0.7, maxTokens: 50 });
      assert.equal(out, "hello there");
    },
  );
  assert.equal(seen.path, "/v1/chat/completions");
  assert.equal(seen.auth, "Bearer sk-1");
  assert.equal(seen.body.model, "m1");
  assert.equal(seen.body.max_tokens, 50);
  assert.equal(seen.body.stream, false);
});

test("throws ProviderError on an HTTP error", async () => {
  await withFakeServer(
    (_req, _body, res) => {
      res.statusCode = 500;
      res.end("boom");
    },
    async (baseUrl) => {
      const p = createOpenAICompatibleProvider({ id: "test", baseUrl, models: [] });
      await assert.rejects(p.complete([{ role: "user", content: "hi" }], "m1"), ProviderError);
    },
  );
});
