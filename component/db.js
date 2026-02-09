// Simple SQLite setup: users + history tables (ESM)
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// ESM-safe _filename/_dirname
const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(__filename);
const __dirname = _dirname;
console.log("__dirname:", __dirname);
// DB file path (next to this file)
const dbPath = path.join(__dirname, "data.sqlite");

// (optional) ensure the folder exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

sqlite3.verbose();
export const db = new sqlite3.Database(dbPath);

// create tables if not exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      prompt TEXT,
      result TEXT,
      target_calories INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});
