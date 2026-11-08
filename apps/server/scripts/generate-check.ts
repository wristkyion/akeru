// apps/server/scripts/generate-check.ts
// Logs in, opens the first chat with the first character you can chat with, and calls Generate.
// Run with the server started:
//   $env:AKERU_TEST_PASS = 'your test password'
//   pnpm exec tsx scripts\generate-check.ts

const BASE = process.env.AKERU_URL ?? "http://localhost:3000";
const USER = process.env.AKERU_USER ?? "test";
const PASS = process.env.AKERU_TEST_PASS ?? "";
const MODEL = process.env.AKERU_MODEL ?? "9router/claude-haiku-4.5-combo";

if (!PASS) {
  console.error("Set AKERU_TEST_PASS first (see the comment at the top).");
  process.exit(1);
}

async function call(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    // keep raw text
  }
  return { status: res.status, data };
}

async function main() {
  const login = await call("POST", "/api/login", undefined, { username: USER, password: PASS, device: "generate-check" });
  if (login.status !== 201) throw new Error(`login failed: ${JSON.stringify(login.data)}`);
  const token = login.data.token as string;

  const chars = await call("GET", "/api/characters", token);
  const character = (chars.data as any[]).find((c) => c.canChat);
  if (!character) throw new Error("no character you can chat with");
  console.log(`Using character: ${character.name}`);

  const chats = await call("GET", `/api/characters/${character.id}/chats`, token);
  let chat = (chats.data as any[])[0];
  if (!chat) {
    const made = await call("POST", "/api/chats", token, { characterId: character.id });
    chat = made.data;
  }
  console.log(`Using chat: ${chat.id}`);

  const result = await call("POST", `/api/chats/${chat.id}/generate`, token, { model: MODEL });
  console.log(`Status ${result.status}`);
  console.log(JSON.stringify(result.data, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
