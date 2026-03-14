/**
 * Database layer — SQLite via sql.js (pure WASM, no native deps).
 * Data persists to server/data/starsim.db.
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'starsim.db');

let db = null;

async function init() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    UNIQUE NOT NULL,
    email       TEXT    UNIQUE,
    password    TEXT,
    google_id   TEXT    UNIQUE,
    avatar_url  TEXT,
    created_at  TEXT    DEFAULT (datetime('now')),
    last_login  TEXT    DEFAULT (datetime('now'))
  )`);

  // Add is_admin column if it doesn't exist (safe for existing databases)
  try { db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0'); } catch {}

  // Promote admin from env: ADMIN_USERS=username1,username2
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const name of adminUsers) {
    db.run('UPDATE users SET is_admin = 1 WHERE username = ?', [name]);
  }

  db.run(`CREATE TABLE IF NOT EXISTS saves (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_name   TEXT    NOT NULL,
    sim_data    TEXT    NOT NULL,
    body_count  INTEGER DEFAULT 0,
    sim_time    REAL    DEFAULT 0,
    preview     TEXT,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reset_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT    UNIQUE NOT NULL,
    expires_at  TEXT    NOT NULL,
    used        INTEGER DEFAULT 0
  )`);

  persist();
  return db;
}

function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function get() { return db; }

// Run a query and return all rows as plain objects
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Run a query and return the first row
function one(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

// Execute a statement (INSERT/UPDATE/DELETE). Returns { changes, lastId }.
function run(sql, params = []) {
  db.run(sql, params);
  const info = db.exec("SELECT changes() AS c, last_insert_rowid() AS id");
  const row = info[0]?.values[0];
  persist();
  return { changes: row?.[0] ?? 0, lastId: row?.[1] ?? 0 };
}

module.exports = { init, get, all, one, run, persist };
