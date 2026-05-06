/**
 * STATE.JS — SQLite persistence layer (sql.js — zero native deps)
 *
 * Tables:
 *   messages  — 对话历史
 *   plays     — 播放记录
 *   plan      — 今日计划
 *   prefs     — 用户偏好 (key-value)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

// DB location from unified paths
const DB_PATH = paths.STATE_DB;

let db = null;
let ready = false;

// ── Init ──

async function init() {
  if (ready) return db;

  // Load WASM from same directory so pkg can bundle it
  const wasmPath = paths.SQL_WASM;
  const wasmBinary = fs.readFileSync(wasmPath);
  const SQL = await initSqlJs({ wasmBinary });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      role      TEXT    NOT NULL CHECK(role IN ('user','assistant','system')),
      content   TEXT    NOT NULL,
      meta      TEXT,
      created_at TEXT  NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS plays (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      track     TEXT    NOT NULL,
      source    TEXT,
      meta      TEXT,
      played_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS plan (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      date      TEXT    NOT NULL UNIQUE,
      content   TEXT    NOT NULL,
      created_at TEXT  NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS prefs (
      key       TEXT PRIMARY KEY,
      value     TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create indexes
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_plays_played    ON plays(played_at)');

  ready = true;
  flush();
  return db;
}

// ── Persist to disk ──

function flush() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

// ── Messages ──

function addMessage(role, content, meta = null) {
  if (!ready) throw new Error('state.init() must be called first');
  db.run(
    'INSERT INTO messages (role, content, meta) VALUES (?, ?, ?)',
    [role, content, meta ? JSON.stringify(meta) : null]
  );
  flush();
}

function getRecentMessages(limit = 20) {
  if (!ready) return [];
  const stmt = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.reverse().map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
}

// ── Plays ──

function addPlay(track, source = 'search', meta = null) {
  if (!ready) throw new Error('state.init() must be called first');
  db.run(
    'INSERT INTO plays (track, source, meta) VALUES (?, ?, ?)',
    [track, source, meta ? JSON.stringify(meta) : null]
  );
  flush();
}

function getRecentPlays(limit = 20) {
  if (!ready) return [];
  const stmt = db.prepare('SELECT * FROM plays ORDER BY played_at DESC LIMIT ?');
  stmt.bind([limit]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.reverse().map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
}

// Get plays from the last 24 hours only (for cold-start dedup)
function getRecentPlays24h(limit = 200) {
  if (!ready) return [];
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const stmt = db.prepare("SELECT * FROM plays WHERE played_at >= ? ORDER BY played_at DESC LIMIT ?");
  stmt.bind([cutoff, limit]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows.reverse().map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
}

// ── Plan ──

function getTodayPlan() {
  if (!ready) return null;
  const today = new Date().toISOString().slice(0, 10);
  const stmt = db.prepare('SELECT * FROM plan WHERE date = ?');
  stmt.bind([today]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  if (row) row.content = JSON.parse(row.content);
  return row;
}

function setTodayPlan(content) {
  if (!ready) throw new Error('state.init() must be called first');
  const today = new Date().toISOString().slice(0, 10);
  db.run(
    'INSERT OR REPLACE INTO plan (date, content) VALUES (?, ?)',
    [today, JSON.stringify(content)]
  );
  flush();
}

// ── Preferences ──

function getPref(key) {
  if (!ready) return null;
  const stmt = db.prepare('SELECT value FROM prefs WHERE key = ?');
  stmt.bind([key]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row ? JSON.parse(row.value) : null;
}

function setPref(key, value) {
  if (!ready) throw new Error('state.init() must be called first');
  db.run(
    'INSERT OR REPLACE INTO prefs (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
    [key, JSON.stringify(value)]
  );
  flush();
}

function getAllPrefs() {
  if (!ready) return {};
  const stmt = db.prepare('SELECT * FROM prefs');
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
}

// ── Bulk snapshot ──

function getState() {
  return {
    plays: getRecentPlays24h(50),  // 24h window — don't haunt AI with ancient history
    plan: getTodayPlan(),
    prefs: getAllPrefs(),
  };
}

// ── Shared filter: block recently played tracks & artists ──

function filterRepeats(tracks) {
  if (!tracks || !tracks.length) return [];
  try {
    const recent = getRecentPlays24h(200);
    const recentArtists = new Set();
    const recentTracks = new Set();
    recent.forEach(p => {
      const t = (p.track || '').toLowerCase().trim();
      if (!t) return;
      recentTracks.add(t);
      const dash = t.indexOf(' - ');
      if (dash > 0) recentArtists.add(t.slice(0, dash).trim());
    });
    // (perma-block removed — user's actual taste)

    const filtered = tracks.filter(t => {
      const label = (t.label || t.name || '').toLowerCase().trim();
      const artist = (t.artists || '').toLowerCase().trim();
      if (recentTracks.has(label)) return false;
      if (artist && artist.length >= 4 && [...recentArtists].some(x =>
        x.length >= 4 && (artist.includes(x) || x.includes(artist)))) return false;
      return true;
    });

    // Never return first track if ALL filtered — let caller go hard fallback
    if (!filtered.length && tracks.length) return [];
    return filtered;
  } catch { return tracks; }
}

module.exports = { init, getState, addMessage, getRecentMessages, addPlay, getRecentPlays, getRecentPlays24h, getTodayPlan, setTodayPlan, getPref, setPref, getAllPrefs, filterRepeats };
