import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser, type User } from "../src/auth.js";
import { createOwnedCharacter, createOwnedChat } from "../src/access.js";
import { addMessage, listMessages } from "../src/chats.js";
import { createProviderRegistry } from "../src/providers/registry.js";
import {
  deleteOwnMessage,
  editOwnMessage,
  getOwnMessage,
  regenerateReply,
  resendFromMessage,
  type ReplyOptions,
} from "../src/messages.js";

function setup() {
  const db = openDatabase(":memory:");
  const admin = createUser(db, { username: "admin", password: "longpassword", role: "admin" });
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const c = createOwnedCharacter(db, admin, { name: "Aria", visibility: "public" });
  const chat = createOwnedChat(db, kai, c.id);
  const hello = addMessage(db, chat.id, "user", "hello");
  const reply = addMessage(db, chat.id, "assistant", "hi there");
  // An empty registry makes every model call fail before any network request
  const registry = createProviderRegistry([]);
  const opts = (actor: User): ReplyOptions => ({
    model: "nope/x",
    historyLimit: 40,
    actor,
    dailyLimit: 0,
  });
  return { db, admin, kai, chat, hello, reply, registry, opts };
}

test("editing saves the text without a model call", () => {
  const { db, kai, hello } = setup();
  editOwnMessage(db, kai, hello.id, "  hey there  ");
  assert.equal(getOwnMessage(db, kai, hello.id)?.content, "hey there");
});

test("other users cannot edit or delete a message", () => {
  const { db, admin, hello } = setup();
  assert.throws(() => editOwnMessage(db, admin, hello.id, "x"), /not found/);
  assert.equal(deleteOwnMessage(db, admin, hello.id), false);
});

test("deleting removes only that message", () => {
  const { db, kai, chat, reply } = setup();
  assert.equal(deleteOwnMessage(db, kai, reply.id), true);
  assert.equal(listMessages(db, chat.id).length, 1);
});

test("refresh only works on an assistant reply", async () => {
  const { db, kai, hello, registry, opts } = setup();
  await assert.rejects(regenerateReply(db, registry, hello.id, opts(kai)), /only assistant/);
});

test("a failed refresh keeps the old reply", async () => {
  const { db, kai, reply, registry, opts } = setup();
  await assert.rejects(regenerateReply(db, registry, reply.id, opts(kai)), /unknown provider/);
  assert.equal(getOwnMessage(db, kai, reply.id)?.content, "hi there");
});

test("resend only works on your own message", async () => {
  const { db, kai, reply, registry, opts } = setup();
  await assert.rejects(
    resendFromMessage(db, registry, reply.id, "x", opts(kai)),
    /only your messages/,
  );
});

test("a failed resend keeps the later messages", async () => {
  const { db, kai, chat, hello, registry, opts } = setup();
  addMessage(db, chat.id, "user", "second");
  addMessage(db, chat.id, "assistant", "second reply");
  await assert.rejects(
    resendFromMessage(db, registry, hello.id, "changed", opts(kai)),
    /unknown provider/,
  );
  assert.equal(listMessages(db, chat.id).length, 4);
  assert.equal(getOwnMessage(db, kai, hello.id)?.content, "hello");
});
