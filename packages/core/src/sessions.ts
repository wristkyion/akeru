import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DB } from "./db.js";
import { getUser, type User } from "./auth.js";

export const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionInfo {
  id: string;
  userId: string;
  username: string;
  deviceName: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  username: string;
  device_name: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
}

// Only a hash of the token is stored, so a leaked database can't be used to log in
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const toSession = (r: SessionRow): SessionInfo => ({
  id: r.id,
  userId: r.user_id,
  username: r.username,
  deviceName: r.device_name,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  expiresAt: r.expires_at,
});

const SESSION_SELECT = `
  SELECT s.id, s.user_id, u.username, s.device_name, s.created_at, s.last_seen_at, s.expires_at
  FROM sessions s JOIN users u ON u.id = s.user_id
`;

// Returns the token once. The client keeps it; the database keeps only its hash.
export function createSession(
  db: DB,
  userId: string,
  deviceName = "unknown device",
): { token: string; session: SessionInfo } {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, device_name, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, hashToken(token), deviceName.slice(0, 80), now, now, now + SESSION_DAYS * DAY_MS);

  const row = db.prepare(`${SESSION_SELECT} WHERE s.id = ?`).get(id) as SessionRow;
  return { token, session: toSession(row) };
}

// Turns a token into its user. Returns null if the token is unknown, expired, revoked, or the user is disabled.
export function resolveToken(db: DB, token: string): { user: User; sessionId: string } | null {
  const row = db
    .prepare("SELECT id, user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(hashToken(token)) as { id: string; user_id: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;

  const user = getUser(db, row.user_id);
  if (!user || user.disabled) return null;

  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(Date.now(), row.id);
  return { user, sessionId: row.id };
}

export function listSessions(db: DB, username?: string): SessionInfo[] {
  const rows = username
    ? db
        .prepare(`${SESSION_SELECT} WHERE u.username = ? ORDER BY s.last_seen_at DESC`)
        .all(username.trim().toLowerCase())
    : db.prepare(`${SESSION_SELECT} ORDER BY s.last_seen_at DESC`).all();
  return (rows as SessionRow[]).map(toSession);
}

export function revokeSession(db: DB, sessionId: string): boolean {
  return db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId).changes > 0;
}

export function revokeUserSessions(db: DB, username: string): number {
  const user = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username.trim().toLowerCase()) as { id: string } | undefined;
  if (!user) throw new Error(`no user "${username}"`);
  return db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id).changes;
}