import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { DB } from "./db.js";

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  displayName: string;
  persona: string;
  role: UserRole;
  disabled: boolean;
  createdAt: number;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role?: UserRole;
  displayName?: string;
  persona?: string;
}

type Row = {
  id: string;
  username: string;
  display_name: string;
  persona: string;
  role: UserRole;
  disabled: number;
  created_at: number;
};

const USERNAME = /^[a-z0-9_-]{3,32}$/;

const toUser = (r: Row): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  persona: r.persona,
  role: r.role,
  disabled: r.disabled === 1,
  createdAt: r.created_at,
});

export function normalizeUsername(name: string): string {
  const u = name.trim().toLowerCase();
  if (!USERNAME.test(u)) {
    throw new Error("username must be 3-32 characters: letters, numbers, _ or -");
  }
  return u;
}

export function validatePassword(password: string): void {
  if (password.length < 8) throw new Error("password must be at least 8 characters");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function getUser(db: DB, id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
  return row ? toUser(row) : null;
}

export function getUserByUsername(db: DB, username: string): User | null {
  const row = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username.trim().toLowerCase()) as Row | undefined;
  return row ? toUser(row) : null;
}

export function listUsers(db: DB): User[] {
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at").all() as Row[];
  return rows.map(toUser);
}

function countAdmins(db: DB, excludeId?: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0 AND id != ?")
    .get(excludeId ?? "") as { n: number };
  return row.n;
}

export function createUser(db: DB, input: CreateUserInput): User {
  const username = normalizeUsername(input.username);
  validatePassword(input.password);
  if (getUserByUsername(db, username)) throw new Error(`user "${username}" already exists`);

  const role = input.role ?? "user";
  const id = randomUUID();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, username, display_name, persona, role, password_hash, disabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      username,
      input.displayName || username,
      input.persona ?? "",
      role,
      hashPassword(input.password),
      Date.now(),
    );

    // The first admin takes ownership of data created before accounts existed
    if (role === "admin" && countAdmins(db, id) === 0) {
      db.prepare("UPDATE characters SET owner_id = ? WHERE owner_id IS NULL").run(id);
      db.prepare("UPDATE chats SET owner_id = ? WHERE owner_id IS NULL").run(id);
    }
  })();

  return getUser(db, id)!;
}

// Returns the user if the password matches and the account is enabled, otherwise null
export function authenticate(db: DB, username: string, password: string): User | null {
  const row = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username.trim().toLowerCase()) as (Row & { password_hash: string }) | undefined;
  if (!row || row.disabled === 1) return null;
  return verifyPassword(password, row.password_hash) ? toUser(row) : null;
}

export function setUserDisabled(db: DB, username: string, disabled: boolean): User {
  const user = getUserByUsername(db, username);
  if (!user) throw new Error(`no user "${username}"`);
  if (disabled && user.role === "admin" && countAdmins(db, user.id) === 0) {
    throw new Error("cannot disable the last enabled admin");
  }
  db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(disabled ? 1 : 0, user.id);
  return getUserByUsername(db, username)!;
}

export function setUserPassword(db: DB, username: string, password: string): User {
  validatePassword(password);
  const user = getUserByUsername(db, username);
  if (!user) throw new Error(`no user "${username}"`);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), user.id);
  return user;
}

export function updateUserProfile(
  db: DB,
  username: string,
  patch: { displayName?: string; persona?: string },
): User {
  const user = getUserByUsername(db, username);
  if (!user) throw new Error(`no user "${username}"`);
  db.prepare(
    "UPDATE users SET display_name = COALESCE(?, display_name), persona = COALESCE(?, persona) WHERE id = ?",
  ).run(patch.displayName ?? null, patch.persona ?? null, user.id);
  return getUserByUsername(db, username)!;
}