/**
 * IMPORT-NETEASE.JS — 网易云歌单导入（可复用模块）
 *
 * Used by: scripts/import-netease.js (CLI) + electron-main.js (UI one-click)
 */

const fs = require('fs');
const path = require('path');

const WEB_API = 'https://music.163.com/api';
const LOCAL_API = process.env.NETEASE_API_URL || 'http://localhost:3000';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── API client ──

async function webGet(endpoint, cookie) {
  const url = `${WEB_API}${endpoint}`;
  const headers = { 'User-Agent': USER_AGENT, 'Referer': 'https://music.163.com/' };
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function localGet(endpoint) {
  const url = `${LOCAL_API}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function apiGet(endpoint, cookie) {
  try { return await localGet(endpoint); } catch {}
  return webGet(endpoint, cookie);
}

function trackToQuery(track) {
  const name = track.name || '';
  const artist = track.ar?.[0]?.name || '';
  if (artist && name) return `${artist} ${name}`;
  return name || '(unknown)';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main import ──

/**
 * Import all user playlists from Netease.
 * @param {string} uid - Netease user ID
 * @param {string} [cookie] - Optional MUSIC_U cookie for direct API
 * @param {string} [outputPath] - Where to write playlists.json (default: user/playlists.json)
 * @param {function} [onProgress] - Progress callback: ({ phase, message, current, total })
 * @returns {{ playlists: object, totalTracks: number, outputPath: string }}
 */
async function importPlaylists(uid, cookie = '', outputPath = null, onProgress = null) {
  const log = (phase, message, current, total) => {
    if (onProgress) onProgress({ phase, message, current, total });
  };

  log('playlists', 'Fetching playlist list...');

  // 1. Get user playlists
  let playlistList;
  try {
    const data = await apiGet(`/user/playlist?uid=${uid}`, cookie);
    playlistList = data.playlist || [];
  } catch (err) {
    throw new Error(`Failed to fetch playlist list: ${err.message}`);
  }

  if (!playlistList.length) {
    throw new Error('No playlists found for this UID.');
  }

  log('playlists', `Found ${playlistList.length} playlists`, 0, playlistList.length);

  // 2. Fetch tracks for each playlist
  const result = {};
  let totalTracks = 0;

  for (let i = 0; i < playlistList.length; i++) {
    const pl = playlistList[i];
    const name = pl.name || `playlist_${pl.id}`;
    log('tracks', `Fetching: ${name}`, i + 1, playlistList.length);

    try {
      const detail = await apiGet(`/playlist/detail?id=${pl.id}`, cookie);
      const tracks = detail.playlist?.tracks || [];
      result[name] = tracks.map(trackToQuery);
      totalTracks += result[name].length;
    } catch (err) {
      log('tracks', `SKIP: ${name} (${err.message})`, i + 1, playlistList.length);
      result[name] = [];
    }

    await sleep(600);
  }

  // 3. Write file
  const outPath = outputPath || path.resolve(__dirname, '..', 'user', 'playlists.json');
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');

  log('done', `Done: ${totalTracks} tracks in ${Object.keys(result).length} playlists`);

  return {
    playlists: result,
    totalTracks,
    playlistCount: Object.keys(result).length,
    outputPath: outPath,
  };
}

module.exports = { importPlaylists };
