import type { DB } from "./db.js";
import type { User } from "./auth.js";
import { addMessage } from "./chats.js";
import { fillPlaceholders } from "./placeholders.js";
import {
  createCharacter,
  deleteCharacter,
  parseTags,
  updateCharacter,
  type CharacterInput,
} from "./characters.js";
import { createChat, deleteChat, type Chat } from "./chats.js";
import { getSelectedPersona } from "./personas.js";

export type Visibility = "public" | "private";

// What one specific user may do with one character
export interface CharacterView {
  id: string;
  name: string;
  description: string;
  definition: string;
  personality: string;
  greeting: string;
  tags: string[];
  avatarPath: string | null;
  visibility: Visibility;
  ownerId: string | null;
  ownerName: string | null;
  canChat: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface NewCharacterInput {
  name: string;
  description?: string;
  definition?: string;
  personality?: string;
  greeting?: string;
  tags?: string[];
  visibility?: Visibility;
}

export type CharacterPatch = Partial<NewCharacterInput>;

type ViewRow = {
  id: string;
  name: string;
  description: string;
  definition: string;
  personality: string;
  greeting: string;
  tags: string;
  avatar_path: string | null;
  visibility: Visibility;
  owner_id: string | null;
  owner_name: string | null;
};

const VIEW_SQL = `
  SELECT c.id, c.name, c.description, c.definition, c.personality, c.greeting, c.tags,
         c.avatar_path, c.visibility, c.owner_id, u.username AS owner_name
  FROM characters c
  LEFT JOIN users u ON u.id = c.owner_id
`;

// Public characters, your own, and every character if you are an admin
const VISIBLE = `(c.visibility = 'public' OR c.owner_id = @uid OR @isAdmin = 1)`;

function params(user: User) {
  return { uid: user.id, isAdmin: user.role === "admin" ? 1 : 0 };
}

// Characters with no owner (made before accounts existed) belong to the admin
function toView(r: ViewRow, user: User): CharacterView {
  const isAdmin = user.role === "admin";
  const isOwner = r.owner_id === user.id;
  const adminOfUnowned = r.owner_id === null && isAdmin;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    definition: r.definition,
    personality: r.personality,
    greeting: r.greeting,
    tags: parseTags(r.tags),
    avatarPath: r.avatar_path,
    visibility: r.visibility,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    canChat: isOwner || r.visibility === "public" || adminOfUnowned,
    canEdit: isOwner || adminOfUnowned,
    canDelete: isOwner || isAdmin,
  };
}

// ---- Characters ----

export function listVisibleCharacters(db: DB, user: User): CharacterView[] {
  const rows = db
    .prepare(`${VIEW_SQL} WHERE ${VISIBLE} ORDER BY c.name`)
    .all(params(user)) as ViewRow[];
  return rows.map((r) => toView(r, user));
}

export function getVisibleCharacter(db: DB, user: User, id: string): CharacterView | null {
  const row = db
    .prepare(`${VIEW_SQL} WHERE c.id = @id AND ${VISIBLE}`)
    .get({ id, ...params(user) }) as ViewRow | undefined;
  return row ? toView(row, user) : null;
}

export function createOwnedCharacter(db: DB, owner: User, input: NewCharacterInput): CharacterView {
  return db.transaction(() => {
    const created = createCharacter(db, {
      name: input.name,
      description: input.description,
      definition: input.definition,
      personality: input.personality,
      greeting: input.greeting,
      tags: input.tags,
    });
    db.prepare("UPDATE characters SET owner_id = ?, visibility = ? WHERE id = ?").run(
      owner.id,
      input.visibility ?? "private",
      created.id,
    );
    return getVisibleCharacter(db, owner, created.id)!;
  })();
}

export function updateOwnedCharacter(
  db: DB,
  user: User,
  id: string,
  patch: CharacterPatch,
): CharacterView {
  const current = getVisibleCharacter(db, user, id);
  if (!current) throw new Error("character not found");
  if (!current.canEdit) throw new Error("only the owner can edit this character");

  const { visibility, ...fields } = patch;
  // Drop undefined values so they don't overwrite existing fields
  const defined = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  ) as Partial<CharacterInput>;

  db.transaction(() => {
    if (Object.keys(defined).length > 0) updateCharacter(db, id, defined);
    if (visibility) {
      db.prepare("UPDATE characters SET visibility = ? WHERE id = ?").run(visibility, id);
    }
  })();

  return getVisibleCharacter(db, user, id)!;
}

// Owners delete their own characters. Admins can delete any character they can see.
export function deleteOwnedCharacter(db: DB, user: User, id: string): boolean {
  const current = getVisibleCharacter(db, user, id);
  if (!current) return false;
  if (!current.canDelete) throw new Error("you can only delete your own characters");
  return deleteCharacter(db, id);
}

// ---- Chats ----

export function getOwnChat(db: DB, user: User, chatId: string): Chat | null {
  const row = db
    .prepare(`
      SELECT id, character_id AS characterId, title, created_at AS createdAt, updated_at AS updatedAt
      FROM chats WHERE id = ? AND owner_id = ?
    `)
    .get(chatId, user.id) as Chat | undefined;
  return row ?? null;
}

// Only the user's own chats. Admins get no special access here.
export function listOwnChats(db: DB, user: User, characterId: string): Chat[] {
  return db
    .prepare(`
      SELECT id, character_id AS characterId, title, created_at AS createdAt, updated_at AS updatedAt
      FROM chats WHERE character_id = ? AND owner_id = ? ORDER BY updated_at DESC
    `)
    .all(characterId, user.id) as Chat[];
}

export function createOwnedChat(db: DB, user: User, characterId: string, title = ""): Chat {
  const character = getVisibleCharacter(db, user, characterId);
  if (!character?.canChat) throw new Error("character not found");
  return db.transaction(() => {
    const chat = createChat(db, characterId, title);
    db.prepare("UPDATE chats SET owner_id = ? WHERE id = ?").run(user.id, chat.id);
    return chat;
  })();
}

export function deleteOwnChat(db: DB, user: User, chatId: string): boolean {
  if (!getOwnChat(db, user, chatId)) return false;
  return deleteChat(db, chatId);
}

// Call this before sending a message. Checks the chat is yours and the character is still available.
export function assertCanSend(db: DB, user: User, chatId: string): Chat {
  const chat = getOwnChat(db, user, chatId);
  if (!chat) throw new Error("chat not found");
  const character = getVisibleCharacter(db, user, chat.characterId);
  if (!character?.canChat) throw new Error("this character is no longer available to you");
  return chat;
}

// Starts a chat and saves the greeting with {{char}} and {{user}} filled in.
// {{user}} is the selected persona's name when there is one, otherwise the display name.
export function startOwnedChat(db: DB, user: User, characterId: string): Chat {
  const character = getVisibleCharacter(db, user, characterId);
  if (!character?.canChat) throw new Error("character not found");

  const chat = createOwnedChat(db, user, characterId);
  if (character.greeting) {
    const selected = getSelectedPersona(db, user.id);
    const text = fillPlaceholders(character.greeting, {
      char: character.name,
      user: selected?.name || user.displayName,
    });
    addMessage(db, chat.id, "assistant", text);
  }
  return chat;
}

// Only the owner can rename. An empty title falls back to the date in the app.
export function renameOwnChat(db: DB, user: User, chatId: string, title: string): Chat {
  if (!getOwnChat(db, user, chatId)) throw new Error("chat not found");
  const clean = title.trim().replace(/\s+/g, " ").slice(0, 80);
  db.prepare("UPDATE chats SET title = ? WHERE id = ?").run(clean, chatId);
  return getOwnChat(db, user, chatId)!;
}