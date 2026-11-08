import Database from "better-sqlite3";

const db = new Database("../../config/chars.db");
const rows = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='server_settings'")
  .all();
console.log(rows.length ? "server_settings exists" : "server_settings is MISSING");
console.log(db.prepare("SELECT key, substr(value, 1, 80) AS value FROM server_settings").all());