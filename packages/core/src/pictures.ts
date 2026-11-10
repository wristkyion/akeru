import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DB } from "./db.js";

export const PICTURE_MAX_BYTES = 2 * 1024 * 1024;
export type PictureType = "image/jpeg" | "image/png" | "image/webp";

export interface PictureStore {
  save(data: Buffer): { id: string; mime: PictureType };
  read(id: string): Buffer | null;
  remove(id: string): void;
}

const ID = /^[a-f0-9]{32}$/;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Checks the real contents of the file, not its name
function sniffType(data: Buffer): PictureType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_MAGIC)) return "image/png";
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

// The key is created once, then reused. Keep this file with chars.db when you back up.
function loadOrCreateKey(keyPath: string): Buffer {
  if (existsSync(keyPath)) {
    const key = Buffer.from(readFileSync(keyPath, "utf8").trim(), "base64");
    if (key.length !== 32) throw new Error("picture key file is damaged");
    return key;
  }
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  return key;
}

// Files are named with random ids and no extension. Each is encrypted with AES-256-GCM.
// Layout on disk: nonce (12 bytes) | auth tag (16 bytes) | ciphertext.
export function createPictureStore(dir: string, keyPath: string): PictureStore {
  mkdirSync(dir, { recursive: true });
  const key = loadOrCreateKey(keyPath);

  return {
    save(data) {
      if (data.length === 0 || data.length > PICTURE_MAX_BYTES) {
        throw new Error("picture is empty or larger than 2 MB");
      }
      const mime = sniffType(data);
      if (!mime) throw new Error("picture must be a JPEG, PNG, or WebP image");

      const id = randomBytes(16).toString("hex");
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const body = Buffer.concat([cipher.update(data), cipher.final()]);
      writeFileSync(join(dir, id), Buffer.concat([nonce, cipher.getAuthTag(), body]));
      return { id, mime };
    },

    read(id) {
      if (!ID.test(id)) return null;
      const path = join(dir, id);
      if (!existsSync(path)) return null;
      const raw = readFileSync(path);
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, NONCE_BYTES));
        decipher.setAuthTag(raw.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
        return Buffer.concat([
          decipher.update(raw.subarray(NONCE_BYTES + TAG_BYTES)),
          decipher.final(),
        ]);
      } catch {
        // A damaged or tampered file is treated as missing
        return null;
      }
    },

    remove(id) {
      if (!ID.test(id)) return;
      const path = join(dir, id);
      if (existsSync(path)) unlinkSync(path);
    },
  };
}

// Where a picture can be attached. Each kind uses a column that already exists or was added in migration 10.
export type PictureTarget = { kind: "user" | "persona" | "character"; id: string };

const SLOTS = {
  user: { table: "users", column: "picture_id", owner: "id" },
  persona: { table: "personas", column: "picture_path", owner: "user_id" },
  character: { table: "characters", column: "avatar_path", owner: "owner_id" },
} as const;

// The current picture id of a target, after checking the owner really owns it
function currentPicture(db: DB, t: PictureTarget, ownerId: string): string | null {
  const s = SLOTS[t.kind];
  const row = db
    .prepare(`SELECT ${s.column} AS value FROM ${s.table} WHERE id = ? AND ${s.owner} = ?`)
    .get(t.id, ownerId) as { value: string | null } | undefined;
  if (!row) throw new Error(`${t.kind} not found`);
  return row.value;
}

function dropPicture(db: DB, store: PictureStore, id: string | null): void {
  if (!id) return;
  store.remove(id);
  db.prepare("DELETE FROM pictures WHERE id = ?").run(id);
}

// Saves a new picture for a target and removes the old one. Only the owner can do this.
export function setPicture(
  db: DB,
  store: PictureStore,
  t: PictureTarget,
  ownerId: string,
  data: Buffer,
): string {
  const old = currentPicture(db, t, ownerId);
  const { id, mime } = store.save(data);
  db.prepare("INSERT INTO pictures (id, owner_id, mime, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    ownerId,
    mime,
    Date.now(),
  );
  const s = SLOTS[t.kind];
  db.prepare(`UPDATE ${s.table} SET ${s.column} = ? WHERE id = ?`).run(id, t.id);
  dropPicture(db, store, old);
  return id;
}

// Removes a target's picture. The fallback avatar is shown after this.
export function clearPicture(db: DB, store: PictureStore, t: PictureTarget, ownerId: string): void {
  const old = currentPicture(db, t, ownerId);
  const s = SLOTS[t.kind];
  db.prepare(`UPDATE ${s.table} SET ${s.column} = NULL WHERE id = ?`).run(t.id);
  dropPicture(db, store, old);
}

export function pictureInfo(db: DB, id: string): { ownerId: string; mime: PictureType } | null {
  const row = db.prepare("SELECT owner_id, mime FROM pictures WHERE id = ?").get(id) as
    | { owner_id: string; mime: PictureType }
    | undefined;
  return row ? { ownerId: row.owner_id, mime: row.mime } : null;
}

// Who may see a picture. Account and persona pictures are visible to signed-in users, because
// accounts are visible. Character pictures follow the character's visibility.
export function canViewPicture(db: DB, viewer: { id: string; role: string }, pictureId: string): boolean {
  if (!pictureInfo(db, pictureId)) return false;
  const used = (sql: string) => db.prepare(sql).get(pictureId) !== undefined;

  if (used("SELECT 1 FROM users WHERE picture_id = ?")) return true;
  if (used("SELECT 1 FROM personas WHERE picture_path = ?")) return true;

  const character = db
    .prepare("SELECT owner_id, visibility FROM characters WHERE avatar_path = ?")
    .get(pictureId) as { owner_id: string | null; visibility: string } | undefined;
  if (character) {
    return (
      character.visibility === "public" ||
      character.owner_id === viewer.id ||
      viewer.role === "admin"
    );
  }
  return false;
}
