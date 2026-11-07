import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser, setUserDisabled } from "../src/auth.js";
import {
  createSession,
  listSessions,
  resolveToken,
  revokeSession,
  revokeUserSessions,
} from "../src/sessions.js";
import { LoginLimiter } from "../src/rate-limit.js";

test("a token resolves to its user, and only its hash is stored", () => {
  const db = openDatabase(":memory:");
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const { token } = createSession(db, kai.id, "phone");

  assert.equal(resolveToken(db, token)?.user.username, "kai");
  const stored = db.prepare("SELECT token_hash FROM sessions").get() as { token_hash: string };
  assert.notEqual(stored.token_hash, token);
});

test("unknown and revoked tokens are rejected", () => {
  const db = openDatabase(":memory:");
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const { token, session } = createSession(db, kai.id);

  assert.equal(resolveToken(db, "not-a-real-token"), null);
  revokeSession(db, session.id);
  assert.equal(resolveToken(db, token), null);
});

test("expired tokens are rejected", () => {
  const db = openDatabase(":memory:");
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const { token } = createSession(db, kai.id);

  db.prepare("UPDATE sessions SET expires_at = 0").run();
  assert.equal(resolveToken(db, token), null);
});

test("disabling a user blocks their existing tokens", () => {
  const db = openDatabase(":memory:");
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const { token } = createSession(db, kai.id);

  setUserDisabled(db, "kai", true);
  assert.equal(resolveToken(db, token), null);
});

test("revokeUserSessions logs out every device", () => {
  const db = openDatabase(":memory:");
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  createSession(db, kai.id, "phone");
  createSession(db, kai.id, "laptop");

  assert.equal(listSessions(db, "kai").length, 2);
  assert.equal(revokeUserSessions(db, "kai"), 2);
  assert.equal(listSessions(db).length, 0);
});

test("login limiter locks a key after repeated failures", () => {
  const limiter = new LoginLimiter(3);
  limiter.fail("k");
  limiter.fail("k");
  assert.equal(limiter.check("k"), 0);

  limiter.fail("k");
  assert.ok(limiter.check("k") > 0);

  limiter.reset("k");
  assert.equal(limiter.check("k"), 0);
});
