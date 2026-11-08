import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser, type User } from "../src/auth.js";
import { createOwnedCharacter, createOwnedChat } from "../src/access.js";
import { addMessage, listMessages } from "../src/chats.js";
import { createProviderRegistry } from "../src/providers/registry.js";
import { generateNext, type ReplyOptions } from "../src/messages.js";

function setup() {
  const db = openDatabase(":memory:");
  const admin = createUser(db, { username: "admin", password: "longpassword", role: "admin" });
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const c = createOwnedCharacter(db, admin, { name: "Akari", visibility: "public" });
  const chat = createOwnedChat(db, kai, c.id);
  const registry = createProviderRegistry([]); // every model call fails before any network request
  const opts = (actor: User, dailyLimit = 0): ReplyOptions => ({
    model: "nope/x",
    historyLimit: 40,
    actor,
    dailyLimit,
  });
  return { db, admin, kai, chat, registry, opts };
}

test("generate needs the character to have spoken last", async () => {
  const { db, kai, chat, registry, opts } = setup();
  addMessage(db, chat.id, "user", "hello");
  await assert.rejects(generateNext(db, registry, chat.id, opts(kai)), /has to speak first/);
});

test("a failed generate saves nothing", async () => {
  const { db, kai, chat, registry, opts } = setup();
  addMessage(db, chat.id, "assistant", "hi there");
  const before = listMessages(db, chat.id).length;
  await assert.rejects(generateNext(db, registry, chat.id, opts(kai)), /unknown provider/);
  assert.equal(listMessages(db, chat.id).length, before);
});

test("generate stops at the daily limit before any model call", async () => {
  const { db, kai, chat, registry, opts } = setup();
  addMessage(db, chat.id, "assistant", "hi there");
  addMessage(db, chat.id, "user", "one");
  addMessage(db, chat.id, "assistant", "reply");
  // The user has sent one message today, and the limit is one
  await assert.rejects(generateNext(db, registry, chat.id, opts(kai, 1)), /daily limit/);
});

test("other users cannot generate in a chat they don't own", async () => {
  const { db, admin, chat, registry, opts } = setup();
  addMessage(db, chat.id, "assistant", "hi there");
  await assert.rejects(generateNext(db, registry, chat.id, opts(admin)), /chat not found|no longer available/);
});
