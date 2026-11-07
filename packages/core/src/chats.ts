import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";

export type Role = "system" | "user" | "assistant";

export interface Chat {
  id: string;
  characterId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  createdAt: number;
}

export function createChat(db: DB, characterId: string, title = ""): Chat {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO chats (id, character_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, characterId, title, now, now);
  return { id, characterId, title, createdAt: now, updatedAt: now };
}

export function listChats(db: DB, characterId: string): Chat[] {
  return db.prepare(`
    SELECT id, character_id AS characterId, title, created_at AS createdAt, updated_at AS updatedAt
    FROM chats WHERE character_id = ? ORDER BY updated_at DESC
  `).all(characterId) as Chat[];
}

export function addMessage(db: DB, chatId: string, role: Role, content: string): Message {
  const now = Date.now();
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(id, chatId, role, content, now);
    db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(now, chatId);
  })();
  return { id, chatId, role, content, createdAt: now };
}

export function listMessages(db: DB, chatId: string): Message[] {
  return db.prepare(`
    SELECT id, chat_id AS chatId, role, content, created_at AS createdAt
    FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC
  `).all(chatId) as Message[];
}

export function deleteChat(db: DB, chatId: string): boolean {
  return db.prepare("DELETE FROM chats WHERE id = ?").run(chatId).changes > 0;
}
// A short single-line title from a message: at most 40 characters
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= 40 ? clean : `${clean.slice(0, 39).trimEnd()}…`;
}