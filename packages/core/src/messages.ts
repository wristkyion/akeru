import type { DB } from "./db.js";
import type { User } from "./auth.js";
import { assertCanSend } from "./access.js";
import { getCharacter } from "./characters.js";
import { addMessage, listMessages, type Message } from "./chats.js";
import { systemPrompt, type Registry, type UserProfile } from "./chat-services.js";
import { assertWithinLimit } from "./limits.js";
import { completeWithRef } from "./providers/registry.js";
import type { GenerationOptions } from "./providers/types.js";

export const MAX_MESSAGE_LENGTH = 8000;

export interface ReplyOptions {
  model: string;
  options?: GenerationOptions;
  historyLimit: number;
  user?: UserProfile;
  actor: User;
  dailyLimit: number; // 0 = unlimited
  onToken?: (token: string) => void;
}

// A message in a chat the user owns. Other users' messages are invisible here.
export function getOwnMessage(db: DB, user: User, messageId: string): Message | null {
  const row = db
    .prepare(`
      SELECT m.id, m.chat_id AS chatId, m.role, m.content, m.created_at AS createdAt
      FROM messages m
      JOIN chats c ON c.id = m.chat_id
      WHERE m.id = ? AND c.owner_id = ?
    `)
    .get(messageId, user.id) as Message | undefined;
  return row ?? null;
}

// Changes the text only. No model call, so it doesn't use the daily limit.
export function editOwnMessage(db: DB, user: User, messageId: string, content: string): Message {
  const msg = getOwnMessage(db, user, messageId);
  if (!msg) throw new Error("message not found");
  const clean = content.trim();
  if (!clean) throw new Error("a message can't be empty");
  if (clean.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`messages can be at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(clean, messageId);
  return { ...msg, content: clean };
}

export function deleteOwnMessage(db: DB, user: User, messageId: string): boolean {
  if (!getOwnMessage(db, user, messageId)) return false;
  return db.prepare("DELETE FROM messages WHERE id = ?").run(messageId).changes > 0;
}

// Builds the prompt the same way a normal send does: persona, recent history, new user text
function promptFor(
  db: DB,
  characterId: string,
  history: Message[],
  content: string,
  opts: ReplyOptions,
) {
  const character = getCharacter(db, characterId);
  if (!character) throw new Error("character not found");
  const recent = history.slice(-opts.historyLimit).map((m) => ({ role: m.role, content: m.content }));
  return [
    { role: "system" as const, content: systemPrompt(character, opts.user) },
    ...recent,
    { role: "user" as const, content },
  ];
}

// Replaces the newest assistant reply with a new one, written from the user message before it.
// The old reply is kept until the new one has been generated.
export async function regenerateReply(
  db: DB,
  registry: Registry,
  messageId: string,
  opts: ReplyOptions,
): Promise<Message> {
  const target = getOwnMessage(db, opts.actor, messageId);
  if (!target) throw new Error("message not found");
  if (target.role !== "assistant") throw new Error("only assistant replies can be regenerated");

  const chat = assertCanSend(db, opts.actor, target.chatId);
  const all = listMessages(db, chat.id);
  const idx = all.findIndex((m) => m.id === target.id);
  if (idx !== all.length - 1) throw new Error("only the latest reply can be regenerated");

  const trigger = all[idx - 1];
  if (!trigger || trigger.role !== "user") throw new Error("no message to answer for this reply");

  if (opts.dailyLimit) assertWithinLimit(db, opts.actor, opts.dailyLimit);

  const messages = promptFor(db, chat.characterId, all.slice(0, idx - 1), trigger.content, opts);
  const text = await completeWithRef(registry, opts.model, messages, opts.options, opts.onToken);

  db.transaction(() => {
    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(text, target.id);
    db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(Date.now(), chat.id);
  })();
  return { ...target, content: text };
}

// Edits one of your messages and writes a new reply to it. Messages after it are replaced.
// Nothing changes unless the model succeeds.
export async function resendFromMessage(
  db: DB,
  registry: Registry,
  messageId: string,
  newContent: string,
  opts: ReplyOptions,
): Promise<{ user: Message; reply: Message }> {
  const target = getOwnMessage(db, opts.actor, messageId);
  if (!target) throw new Error("message not found");
  if (target.role !== "user") throw new Error("only your messages can be edited and resent");

  const chat = assertCanSend(db, opts.actor, target.chatId);
  const clean = newContent.trim();
  if (!clean) throw new Error("a message can't be empty");
  if (clean.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`messages can be at most ${MAX_MESSAGE_LENGTH} characters`);
  }

  if (opts.dailyLimit) assertWithinLimit(db, opts.actor, opts.dailyLimit);

  const all = listMessages(db, chat.id);
  const idx = all.findIndex((m) => m.id === target.id);
  const messages = promptFor(db, chat.characterId, all.slice(0, idx), clean, opts);
  const text = await completeWithRef(registry, opts.model, messages, opts.options, opts.onToken);

  // Only now, with a reply in hand, replace the message and everything after it
  return db.transaction(() => {
    for (const m of all.slice(idx + 1)) {
      db.prepare("DELETE FROM messages WHERE id = ?").run(m.id);
    }
    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(clean, target.id);
    const reply = addMessage(db, chat.id, "assistant", text);
    return { user: { ...target, content: clean }, reply };
  })();
}
