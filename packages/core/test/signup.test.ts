import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser, signUp } from "../src/auth.js";

test("sign-up creates regular users only, blocks reserved names and duplicates", () => {
  const db = openDatabase(":memory:");
  createUser(db, { username: "admin", password: "longpassword", role: "admin" });

  const kai = signUp(db, {
    username: "Kai",
    password: "longpassword",
    displayName: "Kai R.",
    email: "kai@example.com",
  });
  assert.equal(kai.role, "user");
  assert.equal(kai.username, "kai");
  assert.equal(kai.displayName, "Kai R.");
  assert.equal(kai.email, "kai@example.com");

  assert.throws(
    () => signUp(db, { username: "root", password: "longpassword", email: "root@example.com" }),
    /reserved/,
  );
  assert.throws(
    () => signUp(db, { username: "admin", password: "longpassword", email: "admin@example.com" }),
    /reserved/,
  );
  assert.throws(
    () => signUp(db, { username: "KAI", password: "longpassword", email: "other@example.com" }),
    /already exists/,
  );
  assert.throws(
    () => signUp(db, { username: "mia", password: "short", email: "mia@example.com" }),
    /at least 8/,
  );
  assert.throws(
    () => signUp(db, { username: "mia", password: "longpassword", email: "" }),
    /email address is required/,
  );
  assert.throws(
    () => signUp(db, { username: "mia", password: "longpassword", email: "kai@example.com" }),
    /email is already in use/,
  );
});
