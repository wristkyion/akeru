import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db.js";
import { createUser } from "../src/auth.js";
import { createOwnedCharacter } from "../src/access.js";
import {
  PICTURE_MAX_BYTES,
  canViewPicture,
  createPictureStore,
  setPicture,
} from "../src/pictures.js";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "akeru-pics-"));
  const db = openDatabase(":memory:");
  const store = createPictureStore(join(dir, "pictures"), join(dir, "picture.key"));
  const kai = createUser(db, { username: "kai", password: "longpassword" });
  const mia = createUser(db, { username: "mia", password: "longpassword" });
  return { dir, db, store, kai, mia };
}

test("a saved picture reads back unchanged", () => {
  const { store } = setup();
  const { id, mime } = store.save(JPEG);
  assert.equal(mime, "image/jpeg");
  assert.deepEqual(store.read(id), JPEG);
});

test("the file on disk has no image header and no extension", () => {
  const { dir, store } = setup();
  const { id } = store.save(JPEG);
  const names = readdirSync(join(dir, "pictures"));
  assert.deepEqual(names, [id]);
  const raw = readFileSync(join(dir, "pictures", id));
  assert.notDeepEqual(raw.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
});

test("files that are not images are refused", () => {
  const { store } = setup();
  assert.throws(() => store.save(Buffer.from("hello, this is not a picture")), /JPEG, PNG, or WebP/);
});

test("files over 2 MB are refused", () => {
  const { store } = setup();
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(PICTURE_MAX_BYTES)]);
  assert.throws(() => store.save(big), /2 MB/);
});

test("a tampered file is not returned", () => {
  const { dir, store } = setup();
  const { id } = store.save(JPEG);
  writeFileSync(join(dir, "pictures", id), Buffer.from("garbage bytes in place of the file"));
  assert.equal(store.read(id), null);
});

test("replacing a picture removes the old file", () => {
  const { dir, db, store, kai } = setup();
  setPicture(db, store, { kind: "user", id: kai.id }, kai.id, JPEG);
  setPicture(db, store, { kind: "user", id: kai.id }, kai.id, JPEG);
  assert.equal(readdirSync(join(dir, "pictures")).length, 1);
});

test("a private character's picture is hidden from other users", () => {
  const { db, store, kai, mia } = setup();
  const c = createOwnedCharacter(db, kai, { name: "Secret", visibility: "private" });
  const id = setPicture(db, store, { kind: "character", id: c.id }, kai.id, JPEG);
  assert.equal(canViewPicture(db, kai, id), true);
  assert.equal(canViewPicture(db, mia, id), false);
});

test("only the owner can set a character's picture", () => {
  const { db, store, kai, mia } = setup();
  const c = createOwnedCharacter(db, kai, { name: "Akari", visibility: "public" });
  assert.throws(
    () => setPicture(db, store, { kind: "character", id: c.id }, mia.id, JPEG),
    /character not found/,
  );
});
