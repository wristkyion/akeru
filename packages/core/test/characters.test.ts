import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createCharacter, getCharacter, updateCharacter, deleteCharacter } from "../src/characters.js";
import { createChat, addMessage, listMessages } from "../src/chats.js";

test("character CRUD", () => {
  const db = openDatabase(":memory:");
  const c = createCharacter(db, { name: "Aria", greeting: "Hi!" });
  assert.equal(getCharacter(db, c.id)?.name, "Aria");

  const updated = updateCharacter(db, c.id, { personality: "playful" });
  assert.equal(updated?.personality, "playful");

  assert.equal(deleteCharacter(db, c.id), true);
  assert.equal(getCharacter(db, c.id), null);
});

test("chats and messages", () => {
  const db = openDatabase(":memory:");
  const c = createCharacter(db, { name: "Aria" });
  const chat = createChat(db, c.id, "First");
  addMessage(db, chat.id, "user", "hello");
  addMessage(db, chat.id, "assistant", "hi there");
  assert.equal(listMessages(db, chat.id).length, 2);
});

test("deleting a character removes its chats and messages", () => {
  const db = openDatabase(":memory:");
  const c = createCharacter(db, { name: "Aria" });
  const chat = createChat(db, c.id);
  addMessage(db, chat.id, "user", "hello");
  deleteCharacter(db, c.id);
  assert.equal(listMessages(db, chat.id).length, 0);
});
