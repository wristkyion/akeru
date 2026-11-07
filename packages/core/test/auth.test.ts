import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createCharacter } from "../src/characters.js";
import { createChat } from "../src/chats.js";
import {
  authenticate,
  createUser,
  hashPassword,
  setUserDisabled,
  verifyPassword,
} from "../src/auth.js";

test("password hashing", () => {
  const stored = hashPassword("correct horse");
  assert.notEqual(stored, "correct horse");
  assert.equal(verifyPassword("correct horse", stored), true);
  assert.equal(verifyPassword("wrong password", stored), false);
});

test("first admin claims data created before accounts existed", () => {
  const db = openDatabase(":memory:");
  const c = createCharacter(db, { name: "Aria" });
  createChat(db, c.id);

  const admin = createUser(db, { username: "admin", password: "longpassword", role: "admin" });

  const ch = db.prepare("SELECT owner_id FROM characters").get() as { owner_id: string };
  const chat = db.prepare("SELECT owner_id FROM chats").get() as { owner_id: string };
  assert.equal(ch.owner_id, admin.id);
  assert.equal(chat.owner_id, admin.id);
});

test("usernames are unique and not case-sensitive", () => {
  const db = openDatabase(":memory:");
  createUser(db, { username: "Kai", password: "longpassword" });
  assert.throws(
    () => createUser(db, { username: "kai", password: "longpassword" }),
    /already exists/,
  );
});

test("authenticate rejects a wrong password and disabled users", () => {
  const db = openDatabase(":memory:");
  createUser(db, { username: "admin", password: "longpassword", role: "admin" });
  createUser(db, { username: "kai", password: "longpassword" });

  assert.equal(authenticate(db, "kai", "longpassword")?.username, "kai");
  assert.equal(authenticate(db, "kai", "wrongpassword"), null);

  setUserDisabled(db, "kai", true);
  assert.equal(authenticate(db, "kai", "longpassword"), null);
});

test("cannot disable the last enabled admin", () => {
  const db = openDatabase(":memory:");
  createUser(db, { username: "admin", password: "longpassword", role: "admin" });
  assert.throws(() => setUserDisabled(db, "admin", true), /last enabled admin/);
});
