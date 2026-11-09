import type { DB } from "./db.js";

export function applySchema(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      personality TEXT NOT NULL DEFAULT '',
      greeting    TEXT NOT NULL DEFAULT '',
      avatar_path TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id           TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      title        TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chats_character ON chats(character_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
  `);
  runMigrations(db);
}
// Each migration runs once, in order. PRAGMA user_version records how far we got.
const MIGRATIONS: string[] = [
  // 1: user accounts (already applied, do not edit)
  `
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT NOT NULL DEFAULT '',
      persona       TEXT NOT NULL DEFAULT '',
      role          TEXT NOT NULL CHECK (role IN ('admin','user')),
      password_hash TEXT NOT NULL,
      disabled      INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );
    ALTER TABLE characters ADD COLUMN owner_id TEXT REFERENCES users(id);
    ALTER TABLE characters ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
      CHECK (visibility IN ('public','private'));
    ALTER TABLE chats ADD COLUMN owner_id TEXT REFERENCES users(id);
  `,

  // 2: login sessions (already applied, do not edit)
  `
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash   TEXT NOT NULL UNIQUE,
      device_name  TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `,

  // 3: character definition and tags (new)
  `
    ALTER TABLE characters ADD COLUMN definition TEXT NOT NULL DEFAULT '';
    ALTER TABLE characters ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
  `,
  // 4: force a password change at next login (set when an admin resets a password)
  `
    ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
  `,
  // 5: name existing chats after their first message
  `
    UPDATE chats
    SET title = (
      SELECT substr(replace(trim(m.content), char(10), ' '), 1, 40)
      FROM messages m
      WHERE m.chat_id = chats.id AND m.role = 'user'
      ORDER BY m.created_at
      LIMIT 1
    )
    WHERE title = ''
      AND EXISTS (SELECT 1 FROM messages m2 WHERE m2.chat_id = chats.id AND m2.role = 'user');
  `,
  // 6: admin-controlled generation settings, shared by every user
  `
    CREATE TABLE IF NOT EXISTS server_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `,
  // 7: email for each account. Unique when set, so one email can't open two accounts.
  `
    ALTER TABLE users ADD COLUMN email TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
  `,
  // 8: short bio shown on the user's profile
  `
    ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
  `,
];

function runMigrations(db: DB): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
