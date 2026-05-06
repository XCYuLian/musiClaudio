/**
 * PATHS.JS — Unified path resolver (dev + packaged)
 *
 * APP_BASE:  read-only bundled resources (prompts, .env, lib)
 * DATA_ROOT: writable user data (state.db, playlists, cache, user config)
 *
 * In development both point to the project root.
 * In packaged builds APP_BASE = resources/app/, DATA_ROOT = exe directory.
 */

const path = require('path');
const fs = require('fs');

// Detect the runtime base
// APP_BASE: read-only bundled resources (prompts, .env, lib, etc.)
// DATA_ROOT: writable user data (state.db, playlists, cache, user config)
let APP_BASE, DATA_ROOT;
if (process.versions && process.versions.electron) {
  const { app } = require('electron');
  if (app.isPackaged) {
    APP_BASE  = path.join(path.dirname(app.getPath('exe')), 'resources', 'app');
    DATA_ROOT = path.dirname(app.getPath('exe'));
  } else {
    APP_BASE  = path.resolve(__dirname, '../..');
    DATA_ROOT = APP_BASE;
  }
} else if (process.pkg) {
  APP_BASE = path.dirname(process.execPath);
  DATA_ROOT = APP_BASE;
} else {
  APP_BASE = path.resolve(__dirname, '../..');
  DATA_ROOT = APP_BASE;
}

// Writable data lives under DATA_ROOT
const DATA = path.join(DATA_ROOT, 'data');
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

// Sub-directories
const PLAYLISTS = path.join(DATA, 'playlists');
const CACHE     = path.join(DATA, 'cache');
const TTS       = path.join(CACHE, 'tts');

// Ensure sub-directories
[PLAYLISTS, TTS].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Individual file paths
const STATE_DB    = path.join(DATA, 'state.db');
// sql-wasm is always relative to this file (bundled under lib/)
const SQL_WASM    = path.join(__dirname, '../../lib/sql-wasm.wasm');
const PLAYLIST_FILE = path.join(PLAYLISTS, 'liked_songs.json');
const USER_DIR    = path.join(DATA_ROOT, 'user');
const PROMPTS_DIR = path.join(APP_BASE, 'prompts');
const ENV_FILE    = path.join(APP_BASE, '.env');

module.exports = {
  APP_BASE,
  DATA_ROOT,
  DATA,
  PLAYLISTS,
  CACHE,
  TTS,
  STATE_DB,
  SQL_WASM,
  PLAYLIST_FILE,
  USER_DIR,
  PROMPTS_DIR,
  ENV_FILE,
};
