/**
 * scripts/import-netease.js
 *
 * 自动读取用户网易云歌单 → 写入 user/playlists.json
 *
 * 用法:
 *   node scripts/import-netease.js --uid <网易云用户ID>
 *   node scripts/import-netease.js --uid <ID> --save-state   (同时存到 state.db)
 *
 * 前置: NeteaseCloudMusicApi 服务必须已启动 (默认 http://localhost:3000)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');

const NETEASE_URL = process.env.NETEASE_API_URL || 'http://localhost:3000';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'user', 'playlists.json');
const SAVE_STATE = process.argv.includes('--save-state');

// ── Parse args ──
const uidIdx = process.argv.indexOf('--uid');
const UID = uidIdx !== -1 ? process.argv[uidIdx + 1] : null;

if (!UID) {
  console.error('Usage: node scripts/import-netease.js --uid <网易云用户ID>');
  process.exit(1);
}

// ── Helpers ──

async function apiGet(endpoint) {
  const url = `${NETEASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Netease API ${res.status}: ${url}`);
  }
  return res.json();
}

function trackToQuery(track) {
  const name = track.name || '';
  const artist = track.ar?.[0]?.name || '';
  if (artist && name) return `${artist} ${name}`;
  return name || '(unknown)';
}

// ── Main ──

(async () => {
  console.log(`[import] Connecting to Netease API at ${NETEASE_URL}`);
  console.log(`[import] Fetching playlists for user: ${UID}\n`);

  // 1. Get user playlists
  let playlistList;
  try {
    const data = await apiGet(`/user/playlist?uid=${UID}`);
    playlistList = data.playlist || [];
  } catch (err) {
    console.error(`[import] Failed to fetch playlists: ${err.message}`);
    console.error('[import] Make sure NeteaseCloudMusicApi is running.');
    process.exit(1);
  }

  if (!playlistList.length) {
    console.log('[import] No playlists found for this user.');
    process.exit(0);
  }

  console.log(`[import] Found ${playlistList.length} playlists\n`);

  // 2. For each playlist, fetch tracks
  const result = {};
  let totalTracks = 0;

  for (const pl of playlistList) {
    const name = pl.name || `playlist_${pl.id}`;
    console.log(`[import]   Fetching: ${name} (${pl.trackCount} tracks)`);

    try {
      const detail = await apiGet(`/playlist/detail?id=${pl.id}`);
      const tracks = detail.playlist?.tracks || [];
      result[name] = tracks.map(trackToQuery);
      totalTracks += result[name].length;
    } catch (err) {
      console.error(`[import]   → Failed: ${err.message}`);
      result[name] = [];
    }

    // Polite delay between requests
    await sleep(500);
  }

  // 3. Write to file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n[import] Done — ${totalTracks} tracks across ${Object.keys(result).length} playlists`);
  console.log(`[import] Written to: ${OUTPUT_PATH}`);

  // 4. Optionally save to state.db
  if (SAVE_STATE) {
    const state = require('../lib/state');
    await state.init();
    state.setPref('netease_uid', UID);
    state.setPref('netease_playlists_updated', new Date().toISOString());
    console.log('[import] UID saved to state.db');
  } else {
    console.log('[import] Hint: add --save-state to persist UID to state.db');
  }
})();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
