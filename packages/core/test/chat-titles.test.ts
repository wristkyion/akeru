import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser } from "../src/auth.js";
import { createOwnedCharacter, createOwnedChat, renameOwnChat } from "../src/access.js";
import { titleFromMessage } from "../src/chats.js";

test("titles come from the first message, short and single-line", () => {
  assert.equal(titleFromMessage("  hello   there\nfriend "), "hello there friend");
  const long = titleFromMessage("a".repeat(60));
  assert.equal(long.length, 40);
  assert.ok(long.endsWith("…"));
});

test("only the owner can rename a chat", () => {
  const db = openDatabase(":memory:");
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const mia = createUser(db, { username: "mia", password: "longpassword" });
  const c = createOwnedCharacter(db, kai, { name: "Aria", visibility: "public" });
  const chat = createOwnedChat(db, kai, c.id);

  assert.throws(() => renameOwnChat(db, mia, chat.id, "hacked"), /chat not found/);
  assert.equal(renameOwnChat(db, kai, chat.id, "  Shared flowers  ").title, "Shared flowers");
});
