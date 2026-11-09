import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { DB } from "./db.js";

export type UserRole = "admin" | "user";

const USERNAME = /^[a-z0-9_-]{3,32}$/;
const RESERVED_USERNAMES = new Set(["admin", "root", "system", "akeru", "support"]);

export interface User {
  id: string;
  username: string;
  displayName: string;
  persona: string;
  bio: string;
  role: UserRole;
  disabled: boolean;
  mustChangePassword: boolean;
  email: string | null;
  createdAt: number;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role?: UserRole;
  displayName?: string;
  persona?: string;
  bio?: string;
}

type Row = {
  id: string;
  username: string;
  display_name: string;
  persona: string;
  bio: string;
  role: UserRole;
  disabled: number;
  must_change_password: number;
  email: string | null;
  created_at: number;
};

const toUser = (r: Row): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  persona: r.persona,
  bio: r.bio ?? "",
  role: r.role,
  disabled: r.disabled === 1,
  mustChangePassword: r.must_change_password === 1,
  email: r.email,
  createdAt: r.created_at,
});

export function normalizeUsername(name: string): string {
  const u = name.trim().toLowerCase();
  if (!USERNAME.test(u)) {
    throw new Error("username must be 3-32 characters: letters, numbers, _ or -");
  }
  return u;
}

// Lowercased and checked for a basic shape. Strict enough to catch typos, loose enough
// to accept any normal address.
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new Error("enter a valid email address");
  }
  return e;
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

export function getUserByEmail(db: DB, email: string): User | null {
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as Row | undefined;
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

export function createUser(db: DB, input: CreateUserInput & { email?: string }): User {
  const username = normalizeUsername(input.username);
  validatePassword(input.password);
  if (getUserByUsername(db, username)) throw new Error(`user "${username}" already exists`);

  const email = input.email ? normalizeEmail(input.email) : null;
  if (email && getUserByEmail(db, email)) throw new Error("that email is already in use");

  const role = input.role ?? "user";
  const id = randomUUID();
  const bio = (input.bio ?? "").trim().slice(0, 160);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO users (id, username, display_name, persona, role, password_hash, disabled, email, bio, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      username,
      input.displayName || username,
      input.persona ?? "",
      role,
      hashPassword(input.password),
      email,
      bio,
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

// Accepts a username or an email. Returns the user if the password matches and the account is enabled.
export function authenticate(db: DB, login: string, password: string): User | null {
  const key = login.trim().toLowerCase();
  const row = db
    .prepare("SELECT * FROM users WHERE username = @k OR email = @k")
    .get({ k: key }) as (Row & { password_hash: string }) | undefined;
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

// Admin reset: sets a temporary password and requires a change at next login
export function setUserPassword(db: DB, username: string, password: string): User {
  validatePassword(password);
  const user = getUserByUsername(db, username);
  if (!user) throw new Error(`no user "${username}"`);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?").run(
      hashPassword(password),
      user.id,
    );
    // Sign the account out everywhere, so the old password can't keep a session alive
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  })();
  return getUserByUsername(db, username)!;
}

// Admin and CLI edit of an account's display name and persona
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

// The user edits their own display name and bio. Chats use the new name from the next message.
export function updateOwnProfile(
  db: DB,
  user: User,
  patch: { displayName: string; bio: string },
): User {
  const displayName = patch.displayName.trim();
  if (!displayName) throw new Error("display name can't be empty");
  if (displayName.length > 40) throw new Error("display name must be 40 characters or fewer");
  const bio = patch.bio.trim();
  if (bio.length > 160) throw new Error("bio must be 160 characters or fewer");

  db.prepare("UPDATE users SET display_name = ?, bio = ? WHERE id = ?").run(displayName, bio, user.id);
  return getUser(db, user.id)!;
}

// Self-service sign-up. Always creates a regular user, never an admin. Email is required.
export function signUp(
  db: DB,
  input: { username: string; password: string; displayName?: string; email: string; bio?: string },
): User {
  const username = normalizeUsername(input.username);
  if (RESERVED_USERNAMES.has(username)) throw new Error("that username is reserved");
  if (!input.email) throw new Error("an email address is required");
  return createUser(db, {
    username,
    password: input.password,
    role: "user",
    displayName: input.displayName?.trim() || username,
    email: input.email,
    bio: input.bio,
  });
}

// The user changes their own password. Requires the current password.
// Clears the forced-change flag and signs out every other device.
export function changeOwnPassword(
  db: DB,
  user: User,
  current: string,
  next: string,
  keepSessionId?: string,
): User {
  validatePassword(next);
  const row = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(user.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(current, row.password_hash)) {
    throw new Error("current password is wrong");
  }
  if (current === next) throw new Error("choose a different password");

  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(
      hashPassword(next),
      user.id,
    );
    // Keep this device signed in, and end every other session
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(
      user.id,
      keepSessionId ?? "",
    );
  })();

  return getUser(db, user.id)!;
}
