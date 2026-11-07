import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  greeting: string;
  avatarPath: string | null;
  createdAt: number;
  updatedAt: number;
}

export type CharacterInput = {
  name: string;
  description?: string;
  personality?: string;
  greeting?: string;
  avatarPath?: string | null;
};

type Row = {
  id: string; name: string; description: string; personality: string;
  greeting: string; avatar_path: string | null; created_at: number; updated_at: number;
};

const toCharacter = (r: Row): Character => ({
  id: r.id,
  name: r.name,
  description: r.description,
  personality: r.personality,
  greeting: r.greeting,
  avatarPath: r.avatar_path,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function createCharacter(db: DB, input: CharacterInput): Character {
  const now = Date.now();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO characters (id, name, description, personality, greeting, avatar_path, created_at, updated_at)
    VALUES (@id, @name, @description, @personality, @greeting, @avatarPath, @now, @now)
  `).run({
    id,
    name: input.name,
    description: input.description ?? "",
    personality: input.personality ?? "",
    greeting: input.greeting ?? "",
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
  const next = { ...current, ...patch, avatarPath: patch.avatarPath ?? current.avatarPath };
  db.prepare(`
    UPDATE characters
    SET name = @name, description = @description, personality = @personality,
        greeting = @greeting, avatar_path = @avatarPath, updated_at = @now
    WHERE id = @id
  `).run({
    id,
    name: next.name,
    description: next.description,
    personality: next.personality,
    greeting: next.greeting,
    avatarPath: next.avatarPath,
    now: Date.now(),
  });
  return getCharacter(db, id);
}

export function deleteCharacter(db: DB, id: string): boolean {
  return db.prepare("DELETE FROM characters WHERE id = ?").run(id).changes > 0;
}
