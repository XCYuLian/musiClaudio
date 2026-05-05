/**
 * PATHS.JS — Unified path resolver (dev + packaged)
 *
 * In development:  project root (BASE/)
 * In packaged exe: exe directory
 *
 * All writable data goes under BASE/data/.
 */

const path = require('path');
const fs = require('fs');

// Detect the runtime base
let BASE;
if (process.versions && process.versions.electron) {
  // Electron runtime
  const { app } = require('electron');
  BASE = app.isPackaged
    ? path.dirname(app.getPath('exe'))   // e.g. D:\OUTPUT\release\Claudio
    : path.resolve(__dirname, '../..');   // src/core/ → project root
} else if (process.pkg) {
  BASE = path.dirname(process.execPath);
} else {
  BASE = path.resolve(__dirname, '../..'); // src/core/ → project root
}

// Ensure base/data directory
const DATA = path.join(BASE, 'data');
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
const SQL_WASM    = path.join(__dirname, '../../lib/sql-wasm.wasm');
const PLAYLIST_FILE = path.join(PLAYLISTS, 'liked_songs.json');
const USER_DIR    = path.join(BASE, 'user');
const PROMPTS_DIR = path.join(BASE, 'prompts');
const ENV_FILE    = path.join(BASE, '.env');

module.exports = {
  BASE,
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
