import { randomUUID } from "node:crypto";
import type { DB } from "./db.js";

export const MAX_PERSONAS = 5;
export const PERSONA_NAME_MAX = 40;
export const PERSONA_TEXT_MAX = 500;

export interface Persona {
  id: string;
  name: string;
  personality: string;
  pictureUrl: string | null;
  selected: boolean;
  createdAt: number;
}

interface PersonaRow {
  id: string;
  name: string;
  personality: string;
  picture_path: string | null;
  is_selected: number;
  created_at: number;
}

const toPersona = (r: PersonaRow): Persona => ({
  id: r.id,
  name: r.name,
  personality: r.personality,
  pictureUrl: r.picture_path ? `/api/personas/${r.id}/picture` : null,
  selected: r.is_selected === 1,
  createdAt: r.created_at,
});

function cleanFields(input: { name: string; personality: string }) {
  const name = input.name.trim();
  const personality = input.personality.trim();
  if (!name) throw new Error("persona name can't be empty");
  if (name.length > PERSONA_NAME_MAX) {
    throw new Error(`persona name must be ${PERSONA_NAME_MAX} characters or fewer`);
  }
  if (!personality) throw new Error("persona personality can't be empty");
  if (personality.length > PERSONA_TEXT_MAX) {
    throw new Error(`persona personality must be ${PERSONA_TEXT_MAX} characters or fewer`);
  }
  return { name, personality };
}

// Every persona the user has, oldest first. The selected one is marked.
export function listPersonas(db: DB, userId: string): Persona[] {
  const rows = db
    .prepare("SELECT * FROM personas WHERE user_id = ? ORDER BY created_at")
    .all(userId) as PersonaRow[];
  return rows.map(toPersona);
}

// The persona used in chats, or null when the user has none selected.
export function getSelectedPersona(db: DB, userId: string): Persona | null {
  const row = db
    .prepare("SELECT * FROM personas WHERE user_id = ? AND is_selected = 1")
    .get(userId) as PersonaRow | undefined;
  return row ? toPersona(row) : null;
}

// Only the owner can touch a persona. Anything else is reported as not found.
function ownPersonaRow(db: DB, userId: string, personaId: string): PersonaRow {
  const row = db
    .prepare("SELECT * FROM personas WHERE id = ? AND user_id = ?")
    .get(personaId, userId) as PersonaRow | undefined;
  if (!row) throw new Error("persona not found");
  return row;
}

// Adds a persona. The first one becomes the selected persona automatically.
export function createPersona(
  db: DB,
  userId: string,
  input: { name: string; personality: string },
): Persona {
  const fields = cleanFields(input);
  const count = (
    db.prepare("SELECT COUNT(*) AS n FROM personas WHERE user_id = ?").get(userId) as { n: number }
  ).n;
  if (count >= MAX_PERSONAS) {
    throw new Error(`you can keep up to ${MAX_PERSONAS} personas. Delete one to add another`);
  }

  const id = randomUUID();
  db.transaction(() => {
    const hasSelected = db
      .prepare("SELECT 1 FROM personas WHERE user_id = ? AND is_selected = 1")
      .get(userId);
    db.prepare(
      "INSERT INTO personas (id, user_id, name, personality, is_selected, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, userId, fields.name, fields.personality, hasSelected ? 0 : 1, Date.now());
  })();

  return toPersona(ownPersonaRow(db, userId, id));
}

// Changes a persona's name or personality. Its selected state doesn't change.
export function updatePersona(
  db: DB,
  userId: string,
  personaId: string,
  input: { name: string; personality: string },
): Persona {
  ownPersonaRow(db, userId, personaId);
  const fields = cleanFields(input);
  db.prepare("UPDATE personas SET name = ?, personality = ? WHERE id = ? AND user_id = ?").run(
    fields.name,
    fields.personality,
    personaId,
    userId,
  );
  return toPersona(ownPersonaRow(db, userId, personaId));
}

// Makes one persona the selected one, and clears the rest. Only one is ever selected.
export function selectPersona(db: DB, userId: string, personaId: string): Persona {
  ownPersonaRow(db, userId, personaId);
  db.transaction(() => {
    db.prepare("UPDATE personas SET is_selected = 0 WHERE user_id = ?").run(userId);
    db.prepare("UPDATE personas SET is_selected = 1 WHERE id = ? AND user_id = ?").run(
      personaId,
      userId,
    );
  })();
  return toPersona(ownPersonaRow(db, userId, personaId));
}

// Deletes a persona. If it was the selected one, the oldest remaining persona is selected.
// If none remain, nothing is selected and chats use the account's own name and bio.
export function deletePersona(db: DB, userId: string, personaId: string): void {
  const row = ownPersonaRow(db, userId, personaId);
  db.transaction(() => {
    db.prepare("DELETE FROM personas WHERE id = ? AND user_id = ?").run(personaId, userId);
    if (row.is_selected === 1) {
      db.prepare(`
        UPDATE personas SET is_selected = 1
        WHERE id = (
          SELECT id FROM personas WHERE user_id = ? ORDER BY created_at LIMIT 1
        )
      `).run(userId);
    }
  })();
}
// The name and text the chat prompt uses for this account.
// The selected persona's personality wins. Otherwise the account's own persona or bio is used.
export function promptProfileFor(
  db: DB,
  user: { id: string; displayName: string; persona: string; bio: string },
): { name: string; persona: string } {
  const selected = getSelectedPersona(db, user.id);
  const text = selected?.personality || user.persona || user.bio || "";
  return { name: user.displayName, persona: text };
}