import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser } from "../src/auth.js";
import {
  MAX_PERSONAS,
  createPersona,
  deletePersona,
  getSelectedPersona,
  listPersonas,
  selectPersona,
  updatePersona,
} from "../src/personas.js";

function setup() {
  const db = openDatabase(":memory:");
  const user = createUser(db, { username: "kai", password: "longpassword" });
  return { db, user };
}

test("the first persona is selected, and later ones are not", () => {
  const { db, user } = setup();
  const first = createPersona(db, user.id, { name: "cool guy", personality: "Confident and calm." });
  const second = createPersona(db, user.id, { name: "robot", personality: "Speaks in short lines." });
  assert.equal(first.selected, true);
  assert.equal(second.selected, false);
  assert.equal(getSelectedPersona(db, user.id)?.id, first.id);
});

test("selecting a persona clears the previous one", () => {
  const { db, user } = setup();
  createPersona(db, user.id, { name: "a", personality: "one" });
  const b = createPersona(db, user.id, { name: "b", personality: "two" });
  selectPersona(db, user.id, b.id);
  const selected = listPersonas(db, user.id).filter((p) => p.selected);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, b.id);
});

test("no more than five personas per account", () => {
  const { db, user } = setup();
  for (let i = 0; i < MAX_PERSONAS; i++) {
    createPersona(db, user.id, { name: `p${i}`, personality: "text" });
  }
  assert.throws(
    () => createPersona(db, user.id, { name: "extra", personality: "text" }),
    /up to 5 personas/,
  );
});

test("deleting the selected persona selects the oldest remaining one", () => {
  const { db, user } = setup();
  const first = createPersona(db, user.id, { name: "a", personality: "one" });
  createPersona(db, user.id, { name: "b", personality: "two" });
  deletePersona(db, user.id, first.id);
  assert.equal(getSelectedPersona(db, user.id)?.name, "b");
});

test("deleting the last persona leaves none selected", () => {
  const { db, user } = setup();
  const only = createPersona(db, user.id, { name: "a", personality: "one" });
  deletePersona(db, user.id, only.id);
  assert.equal(getSelectedPersona(db, user.id), null);
});

test("one user cannot change another user's persona", () => {
  const { db, user } = setup();
  const other = createUser(db, { username: "mia", password: "longpassword" });
  const mine = createPersona(db, user.id, { name: "a", personality: "one" });
  assert.throws(
    () => updatePersona(db, other.id, mine.id, { name: "x", personality: "y" }),
    /persona not found/,
  );
});

test("personal text is trimmed, and empty names are refused", () => {
  const { db, user } = setup();
  const p = createPersona(db, user.id, { name: "  cool guy  ", personality: " calm " });
  assert.equal(p.name, "cool guy");
  assert.equal(p.personality, "calm");
  assert.throws(() => createPersona(db, user.id, { name: " ", personality: "x" }), /can't be empty/);
});
