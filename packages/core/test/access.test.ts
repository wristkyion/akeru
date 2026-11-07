import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser } from "../src/auth.js";
import { addMessage } from "../src/chats.js";
import {
  assertCanSend,
  createOwnedChat,
  createOwnedCharacter,
  deleteOwnedCharacter,
  getOwnChat,
  getVisibleCharacter,
  listOwnChats,
  listVisibleCharacters,
  updateOwnedCharacter,
} from "../src/access.js";

function setup() {
  const db = openDatabase(":memory:");
  const admin = createUser(db, { username: "admin", password: "longpassword", role: "admin" });
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const mia = createUser(db, { username: "mia", password: "longpassword" });
  return { db, admin, kai, mia };
}

test("users see their own and public characters, admin sees all", () => {
  const { db, admin, kai, mia } = setup();
  const pub = createOwnedCharacter(db, kai, { name: "Aria", visibility: "public" });
  const priv = createOwnedCharacter(db, kai, { name: "Secret" });
  createOwnedCharacter(db, mia, { name: "Mia's" });

  assert.deepEqual(listVisibleCharacters(db, mia).map((c) => c.name), ["Aria", "Mia's"]);
  assert.deepEqual(
    listVisibleCharacters(db, admin).map((c) => c.name),
    ["Aria", "Mia's", "Secret"],
  );

  // Admin sees who made a private character, but cannot chat with it
  const seen = getVisibleCharacter(db, admin, priv.id);
  assert.equal(seen?.ownerName, "kai");
  assert.equal(seen?.canChat, false);
  assert.equal(getVisibleCharacter(db, mia, priv.id), null);
  assert.equal(pub.canChat, true);
});

test("only the owner can edit, and making a character private hides it", () => {
  const { db, kai, mia } = setup();
  const c = createOwnedCharacter(db, kai, { name: "Aria", visibility: "public" });

  assert.throws(() => updateOwnedCharacter(db, mia, c.id, { name: "Hacked" }), /only the owner/);

  updateOwnedCharacter(db, kai, c.id, { description: "updated", visibility: "private" });
  assert.equal(getVisibleCharacter(db, mia, c.id), null);
  assert.equal(getVisibleCharacter(db, kai, c.id)?.description, "updated");
});

test("owners and admins can delete, other users cannot", () => {
  const { db, admin, kai, mia } = setup();
  const c = createOwnedCharacter(db, kai, { name: "Aria", visibility: "public" });

  assert.throws(() => deleteOwnedCharacter(db, mia, c.id), /only delete your own/);
  assert.equal(deleteOwnedCharacter(db, admin, c.id), true);
});

test("chats are private to their owner", () => {
  const { db, admin, kai, mia } = setup();
  const c = createOwnedCharacter(db, kai, { name: "Aria", visibility: "public" });
  const chat = createOwnedChat(db, kai, c.id);
  addMessage(db, chat.id, "user", "hello");

  assert.equal(getOwnChat(db, mia, chat.id), null);
  assert.equal(getOwnChat(db, admin, chat.id), null);
  assert.equal(listOwnChats(db, mia, c.id).length, 0);
  assert.throws(() => assertCanSend(db, mia, chat.id), /chat not found/);
  assert.equal(assertCanSend(db, kai, chat.id).id, chat.id);
});

test("users cannot start chats with private characters they do not own", () => {
  const { db, admin, kai, mia } = setup();
  const priv = createOwnedCharacter(db, kai, { name: "Secret" });

  assert.throws(() => createOwnedChat(db, mia, priv.id), /character not found/);
  assert.throws(() => createOwnedChat(db, admin, priv.id), /character not found/);
});

test("an existing chat stops working when its character becomes private", () => {
  const { db, kai, mia } = setup();
  const c = createOwnedCharacter(db, kai, { name: "Aria", visibility: "public" });
  const chat = createOwnedChat(db, mia, c.id);

  updateOwnedCharacter(db, kai, c.id, { visibility: "private" });
  assert.throws(() => assertCanSend(db, mia, chat.id), /no longer available/);
});
