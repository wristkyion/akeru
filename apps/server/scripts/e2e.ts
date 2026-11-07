// apps/server/scripts/e2e.ts
// End-to-end checks against a running server.
// Start the server first (pnpm start), then from apps\server run:
//   $env:AKERU_ADMIN_PASS="your admin password"
//   $env:AKERU_TEST_PASS="your test password"
//   pnpm exec tsx scripts\e2e.ts

const BASE = process.env.AKERU_URL ?? "http://localhost:3000";
const ADMIN = { username: "admin", password: process.env.AKERU_ADMIN_PASS ?? "" };
const TEST = { username: "test", password: process.env.AKERU_TEST_PASS ?? "" };

if (!ADMIN.password || !TEST.password) {
  console.error("Set AKERU_ADMIN_PASS and AKERU_TEST_PASS first (see the comment at the top).");
  process.exit(1);
}

type Res = { status: number; data: any };

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON, keep the raw text
  }
  return { status: res.status, data };
}

function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function expectStatus(res: Res, status: number, what: string) {
  expect(
    res.status === status,
    `${what}: expected HTTP ${status}, got ${res.status} ${JSON.stringify(res.data)}`,
  );
}

let passed = 0;
let failed = 0;
const created: { id: string; name: string }[] = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function login(account: { username: string; password: string }): Promise<string> {
  const r = await call("POST", "/api/login", { body: { ...account, device: "e2e-test" } });
  expectStatus(r, 201, `login ${account.username}`);
  return r.data.token as string;
}

async function main() {
  let adminToken = "";
  let testToken = "";
  let adminPrivateId = "";
  let adminPublicId = "";
  let testPublicId = "";
  let testPrivateId = "";
  let chatId = "";

  console.log(`Akeru end-to-end checks against ${BASE}\n`);

  try {
    console.log("Server and login");

    await check("health check is public", async () => {
      const r = await call("GET", "/api/health");
      expectStatus(r, 200, "health");
      expect(r.data.ok === true, "health did not return ok");
    });

    await check("protected route rejects a request with no token", async () => {
      expectStatus(await call("GET", "/api/characters"), 401, "no-token list");
    });

    await check("wrong password is rejected", async () => {
      const r = await call("POST", "/api/login", {
        body: { username: "nobody-e2e", password: "definitely-wrong" },
      });
      expectStatus(r, 401, "wrong password");
    });

    await check("admin logs in and /api/me returns the account", async () => {
      adminToken = await login(ADMIN);
      const r = await call("GET", "/api/me", { token: adminToken });
      expectStatus(r, 200, "me as admin");
      expect(
        r.data.username === "admin" && r.data.role === "admin",
        `unexpected account: ${JSON.stringify(r.data)}`,
      );
    });

    await check("test user logs in and /api/me returns the account", async () => {
      testToken = await login(TEST);
      const r = await call("GET", "/api/me", { token: testToken });
      expectStatus(r, 200, "me as test");
      expect(
        r.data.username === "test" && r.data.role === "user",
        `unexpected account: ${JSON.stringify(r.data)}`,
      );
    });

    console.log("\nCreating characters");

    await check("admin creates a private character (default)", async () => {
      const r = await call("POST", "/api/characters", {
        token: adminToken,
        body: { name: "E2E Admin Private", greeting: "Hi e2e." },
      });
      expectStatus(r, 201, "create admin private");
      expect(r.data.visibility === "private", "default visibility should be private");
      adminPrivateId = r.data.id;
      created.push({ id: r.data.id, name: r.data.name });
    });

    await check("admin creates a public character", async () => {
      const r = await call("POST", "/api/characters", {
        token: adminToken,
        body: { name: "E2E Admin Public", visibility: "public", greeting: "Hi e2e." },
      });
      expectStatus(r, 201, "create admin public");
      adminPublicId = r.data.id;
      created.push({ id: r.data.id, name: r.data.name });
    });

    await check("test user creates a public character", async () => {
      const r = await call("POST", "/api/characters", {
        token: testToken,
        body: { name: "E2E Test Public", visibility: "public", greeting: "Hi e2e." },
      });
      expectStatus(r, 201, "create test public");
      testPublicId = r.data.id;
      created.push({ id: r.data.id, name: r.data.name });
    });

    await check("test user creates a private character", async () => {
      const r = await call("POST", "/api/characters", {
        token: testToken,
        body: { name: "E2E Test Private", greeting: "Hi e2e." },
      });
      expectStatus(r, 201, "create test private");
      testPrivateId = r.data.id;
      created.push({ id: r.data.id, name: r.data.name });
    });

    console.log("\nVisibility");

    await check("test user sees public and own characters, not admin's private one", async () => {
      const r = await call("GET", "/api/characters", { token: testToken });
      expectStatus(r, 200, "test list");
      const names = r.data.map((c: any) => c.name);
      expect(names.includes("E2E Test Public"), "missing own public character");
      expect(names.includes("E2E Test Private"), "missing own private character");
      expect(names.includes("E2E Admin Public"), "missing public admin character");
      expect(!names.includes("E2E Admin Private"), "test user can see admin's private character");
    });

    await check("admin sees everything, with owners, and cannot chat with others' private", async () => {
      const r = await call("GET", "/api/characters", { token: adminToken });
      expectStatus(r, 200, "admin list");
      const priv = r.data.find((c: any) => c.id === testPrivateId);
      expect(priv, "admin cannot see the test user's private character");
      expect(priv.ownerName === "test", `owner name wrong: ${priv.ownerName}`);
      expect(priv.canChat === false, "admin should not be able to chat with it");
      expect(priv.canDelete === true, "admin should be able to delete it");
    });

    await check("test user gets 404 for admin's private character by id", async () => {
      expectStatus(
        await call("GET", `/api/characters/${adminPrivateId}`, { token: testToken }),
        404,
        "private by id",
      );
    });

    console.log("\nPermissions");

    await check("test user cannot edit admin's public character", async () => {
      const r = await call("PUT", `/api/characters/${adminPublicId}`, {
        token: testToken,
        body: { name: "Hacked" },
      });
      expectStatus(r, 403, "edit admin's character");
    });

    await check("admin cannot edit the test user's character", async () => {
      const r = await call("PUT", `/api/characters/${testPublicId}`, {
        token: adminToken,
        body: { name: "Hacked" },
      });
      expectStatus(r, 403, "admin edit of test user's character");
    });

    await check("test user cannot delete admin's public character", async () => {
      expectStatus(
        await call("DELETE", `/api/characters/${adminPublicId}`, { token: testToken }),
        403,
        "delete admin's character",
      );
    });

    await check("admin cannot start a chat with the test user's private character", async () => {
      expectStatus(
        await call("POST", "/api/chats", {
          token: adminToken,
          body: { characterId: testPrivateId },
        }),
        404,
        "admin chat with private character",
      );
    });

    console.log("\nChats and privacy");

    await check("test user starts a chat with a public character and gets the greeting", async () => {
      const r = await call("POST", "/api/chats", {
        token: testToken,
        body: { characterId: adminPublicId },
      });
      expectStatus(r, 201, "create chat");
      chatId = r.data.id;

      const msgs = await call("GET", `/api/chats/${chatId}/messages`, { token: testToken });
      expectStatus(msgs, 200, "list messages");
      expect(
        msgs.data.length === 1 && msgs.data[0].role === "assistant",
        `expected one greeting, got ${JSON.stringify(msgs.data)}`,
      );
    });

    await check("admin cannot read the test user's chat", async () => {
      expectStatus(
        await call("GET", `/api/chats/${chatId}/messages`, { token: adminToken }),
        404,
        "admin reads test user's chat",
      );
    });

    await check("a failed model call returns 502 and saves nothing", async () => {
      // "nope/x" names a provider that doesn't exist, so no network call is made
      const r = await call("POST", `/api/chats/${chatId}/messages`, {
        token: testToken,
        body: { content: "hello", model: "nope/x" },
      });
      expectStatus(r, 502, "failed send");

      const msgs = await call("GET", `/api/chats/${chatId}/messages`, { token: testToken });
      expect(
        msgs.data.length === 1,
        `failed send left ${msgs.data.length} messages, expected 1`,
      );
    });

    await check("making a character private cuts off an existing chat", async () => {
      expectStatus(
        await call("PUT", `/api/characters/${adminPublicId}`, {
          token: adminToken,
          body: { visibility: "private" },
        }),
        200,
        "make character private",
      );
      const r = await call("POST", `/api/chats/${chatId}/messages`, {
        token: testToken,
        body: { content: "still there?", model: "nope/x" },
      });
      expectStatus(r, 403, "send after privacy change");
    });

    console.log("\nLogout");

    await check("logout ends the session", async () => {
      expectStatus(
        await call("POST", "/api/logout", { token: testToken, body: {} }),
        200,
        "logout",
      );
      expectStatus(
        await call("GET", "/api/characters", { token: testToken }),
        401,
        "list after logout",
      );
    });
  } finally {
    console.log("\nCleanup");
    if (adminToken) {
      for (const c of created) {
        const r = await call("DELETE", `/api/characters/${c.id}`, { token: adminToken });
        console.log(
          r.status === 200 ? `  removed ${c.name}` : `  could not remove ${c.name}: HTTP ${r.status}`,
        );
      }
    } else {
      console.log("  skipped: admin login failed, remove the E2E characters manually");
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
