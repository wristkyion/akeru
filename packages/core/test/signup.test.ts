import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser, signUp } from "../src/auth.js";

test("sign-up creates regular users only, blocks reserved names and duplicates", () => {
  const db = openDatabase(":memory:");
  createUser(db, { username: "admin", password: "longpassword", role: "admin" });

  const kai = signUp(db, { username: "Kai", password: "longpassword", displayName: "Kai R." });
  assert.equal(kai.role, "user");
  assert.equal(kai.username, "kai");
  assert.equal(kai.displayName, "Kai R.");

  assert.throws(() => signUp(db, { username: "root", password: "longpassword" }), /reserved/);
  assert.throws(() => signUp(db, { username: "admin", password: "longpassword" }), /reserved/);
  assert.throws(() => signUp(db, { username: "KAI", password: "longpassword" }), /already exists/);
  assert.throws(() => signUp(db, { username: "mia", password: "short" }), /at least 8/);
});
