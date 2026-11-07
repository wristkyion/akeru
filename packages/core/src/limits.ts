import type { DB } from "./db.js";
import type { User } from "./auth.js";

// Midnight today, in the server's local time zone
export function startOfToday(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Messages this user has sent today across all their chats.
// Failed sends are never saved, so they don't count.
export function messagesSentToday(db: DB, userId: string, now = new Date()): number {
  const row = db
    .prepare(`
      SELECT COUNT(*) AS n
      FROM messages m
      JOIN chats c ON c.id = m.chat_id
      WHERE c.owner_id = ? AND m.role = 'user' AND m.created_at >= ?
    `)
    .get(userId, startOfToday(now)) as { n: number };
  return row.n;
}

export interface Usage {
  used: number;
  limit: number | null; // null = unlimited (admins, or limit set to 0)
  remaining: number | null;
}

export function getUsage(db: DB, user: User, dailyLimit: number, now = new Date()): Usage {
  const used = messagesSentToday(db, user.id, now);
  if (user.role === "admin" || dailyLimit <= 0) return { used, limit: null, remaining: null };
  return { used, limit: dailyLimit, remaining: Math.max(0, dailyLimit - used) };
}

// Throws before any model call when the user has used up today's messages
export function assertWithinLimit(db: DB, user: User, dailyLimit: number, now = new Date()): void {
  const usage = getUsage(db, user, dailyLimit, now);
  if (usage.limit !== null && usage.used >= usage.limit) {
    throw new Error(`daily limit reached (${usage.limit} messages per day). It resets at midnight.`);
  }
}
