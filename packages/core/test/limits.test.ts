import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser } from "../src/auth.js";
import { createOwnedCharacter, createOwnedChat } from "../src/access.js";
import { addMessage } from "../src/chats.js";
import { assertWithinLimit, getUsage } from "../src/limits.js";

test("daily limit counts user messages only, and admins are exempt", () => {
  const db = openDatabase(":memory:");
  const admin = createUser(db, { username: "admin", password: "longpassword", role: "admin" });
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const c = createOwnedCharacter(db, admin, { name: "Aria", visibility: "public" });
  const chat = createOwnedChat(db, kai, c.id);

  addMessage(db, chat.id, "user", "one");
  addMessage(db, chat.id, "assistant", "reply");
  addMessage(db, chat.id, "user", "two");

  const usage = getUsage(db, kai, 2);
  assert.equal(usage.used, 2);
  assert.equal(usage.remaining, 0);
  assert.throws(() => assertWithinLimit(db, kai, 2), /daily limit/);

  assert.doesNotThrow(() => assertWithinLimit(db, admin, 1));
  assert.equal(getUsage(db, admin, 2).limit, null);
});

test("messages from before today do not count", () => {
  const db = openDatabase(":memory:");
  const admin = createUser(db, { username: "admin", password: "longpassword", role: "admin" });
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const c = createOwnedCharacter(db, admin, { name: "Aria", visibility: "public" });
  const chat = createOwnedChat(db, kai, c.id);

  addMessage(db, chat.id, "user", "old");
  db.prepare("UPDATE messages SET created_at = ?").run(Date.now() - 2 * 24 * 60 * 60 * 1000);

  assert.equal(getUsage(db, kai, 2).used, 0);
});

test("a limit of 0 means unlimited", () => {
  const db = openDatabase(":memory:");
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  assert.equal(getUsage(db, kai, 0).limit, null);
});
