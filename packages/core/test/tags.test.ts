import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { createUser } from "../src/auth.js";
import { createCharacter, getCharacter, normalizeTags } from "../src/characters.js";
import { createOwnedCharacter, getVisibleCharacter, updateOwnedCharacter } from "../src/access.js";

test("tags are trimmed, de-duplicated ignoring case, and capped", () => {
  assert.deepEqual(normalizeTags(["  Fantasy ", "fantasy", "", "Mystery  Club"]), [
    "Fantasy",
    "Mystery Club",
  ]);
  const many = Array.from({ length: 15 }, (_, i) => `tag${i}`);
  assert.equal(normalizeTags(many).length, 10);
  assert.equal(normalizeTags(["x".repeat(40)])[0].length, 24);
});

test("definition and tags are stored, returned, and updated", () => {
  const db = openDatabase(":memory:");
  const admin = createUser(db, { username: "admin", password: "longpassword", role: "admin" });
  const kai = createUser(db, { username: "kai", password: "longpassword" });

  const c = createOwnedCharacter(db, kai, {
    name: "Mira",
    definition: "A librarian who lives above the bookshop.",
    tags: ["Slice of life", "calm"],
    visibility: "public",
  });
  assert.equal(c.definition, "A librarian who lives above the bookshop.");
  assert.deepEqual(c.tags, ["Slice of life", "calm"]);

  updateOwnedCharacter(db, kai, c.id, { tags: ["romance"] });
  assert.deepEqual(getVisibleCharacter(db, admin, c.id)?.tags, ["romance"]);

  // Characters created without the new fields read as empty values
  const plain = createCharacter(db, { name: "Plain" });
  assert.equal(getCharacter(db, plain.id)?.definition, "");
  assert.deepEqual(getCharacter(db, plain.id)?.tags, []);
});
