import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { changeOwnPassword, createUser, authenticate, setUserPassword } from "../src/auth.js";
import { createSession, listSessions } from "../src/sessions.js";

test("changing your own password needs the current one and ends other sessions", () => {
  const db = openDatabase(":memory:");
  const kai = createUser(db, { username: "kai", password: "oldpassword" });
  const keep = createSession(db, kai.id, "laptop");
  createSession(db, kai.id, "phone");

  assert.throws(() => changeOwnPassword(db, kai, "wrongpassword", "newpassword1"), /current password/);
  assert.throws(() => changeOwnPassword(db, kai, "oldpassword", "oldpassword"), /different/);

  changeOwnPassword(db, kai, "oldpassword", "newpassword1", keep.session.id);
  assert.equal(authenticate(db, "kai", "oldpassword"), null);
  assert.equal(authenticate(db, "kai", "newpassword1")?.username, "kai");
  assert.equal(listSessions(db, "kai").length, 1);
});

test("an admin reset forces a change at next login and signs the user out", () => {
  const db = openDatabase(":memory:");
  createUser(db, { username: "admin", password: "adminpassword", role: "admin" });
  const mia = createUser(db, { username: "mia", password: "oldpassword" });
  createSession(db, mia.id, "phone");

  const reset = setUserPassword(db, "mia", "temporary1");
  assert.equal(reset.mustChangePassword, true);
  assert.equal(listSessions(db, "mia").length, 0);

  const after = changeOwnPassword(db, mia, "temporary1", "mypassword1");
  assert.equal(after.mustChangePassword, false);
});
