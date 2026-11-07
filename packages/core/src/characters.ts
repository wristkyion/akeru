import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;

export interface Character {
  id: string;
  name: string;
  description: string;
  definition: string;
  personality: string;
  greeting: string;
  tags: string[];
  avatarPath: string | null;
  createdAt: number;
  updatedAt: number;
}

export type CharacterInput = {
  name: string;
  description?: string;
  definition?: string;
  personality?: string;
  greeting?: string;
  tags?: string[];
  avatarPath?: string | null;
};

type Row = {
  id: string;
  name: string;
  description: string;
  definition: string;
  personality: string;
  greeting: string;
  tags: string;
  avatar_path: string | null;
  created_at: number;
  updated_at: number;
};

// Trims, collapses spaces, drops empty and case-insensitive duplicates, applies the limits
export function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

// Tags are stored as a JSON array. Bad data reads as no tags instead of crashing.
export function parseTags(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const toCharacter = (r: Row): Character => ({
  id: r.id,
  name: r.name,
  description: r.description,
  definition: r.definition,
  personality: r.personality,
  greeting: r.greeting,
  tags: parseTags(r.tags),
  avatarPath: r.avatar_path,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function createCharacter(db: DB, input: CharacterInput): Character {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO characters
      (id, name, description, definition, personality, greeting, tags, avatar_path, created_at, updated_at)
    VALUES
      (@id, @name, @description, @definition, @personality, @greeting, @tags, @avatarPath, @now, @now)
  `).run({
    id,
    name: input.name,
    description: input.description ?? "",
    definition: input.definition ?? "",
    personality: input.personality ?? "",
    greeting: input.greeting ?? "",
    tags: JSON.stringify(normalizeTags(input.tags)),
    avatarPath: input.avatarPath ?? null,
    now,
  });
  return getCharacter(db, id)!;
}

export function getCharacter(db: DB, id: string): Character | null {
  const row = db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as Row | undefined;
  return row ? toCharacter(row) : null;
}

export function listCharacters(db: DB): Character[] {
  const rows = db.prepare("SELECT * FROM characters ORDER BY name").all() as Row[];
  return rows.map(toCharacter);
}

export function updateCharacter(db: DB, id: string, patch: Partial<CharacterInput>): Character | null {
  const current = getCharacter(db, id);
  if (!current) return null;

  const next = {
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    definition: patch.definition ?? current.definition,
    personality: patch.personality ?? current.personality,
    greeting: patch.greeting ?? current.greeting,
    tags: patch.tags !== undefined ? normalizeTags(patch.tags) : current.tags,
    avatarPath: patch.avatarPath !== undefined ? patch.avatarPath : current.avatarPath,
  };

  db.prepare(`
    UPDATE characters
    SET name = @name, description = @description, definition = @definition,
        personality = @personality, greeting = @greeting, tags = @tags,
        avatar_path = @avatarPath, updated_at = @now
    WHERE id = @id
  `).run({
    id,
    name: next.name,
    description: next.description,
    definition: next.definition,
    personality: next.personality,
    greeting: next.greeting,
    tags: JSON.stringify(next.tags),
    avatarPath: next.avatarPath,
    now: Date.now(),
  });
  return getCharacter(db, id);
}

export function deleteCharacter(db: DB, id: string): boolean {
  return db.prepare("DELETE FROM characters WHERE id = ?").run(id).changes > 0;
}
