/**
 * scripts/import-netease.js
 *
 * 自动读取网易云歌单 → 写入 user/playlists.json
 *
 * 用法:
 *   方式1 (本地API):  node scripts/import-netease.js --uid <ID>
 *   方式2 (Cookie直连): node scripts/import-netease.js --uid <ID> --cookie "MUSIC_U=xxx;"
 *   同时存到 state.db:  加 --save-state
 *
 * 获取 Cookie:
 *   1. 浏览器打开 music.163.com 并登录
 *   2. F12 → Application → Cookies → 复制 MUSIC_U 的值
 *   3. 传入 --cookie "MUSIC_U=你复制的值"
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.resolve(__dirname, '..', 'user', 'playlists.json');
const SAVE_STATE = process.argv.includes('--save-state');

// ── Parse args ──
const getArg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
};

const UID = getArg('--uid') || process.env.NETEASE_UID;
const COOKIE = getArg('--cookie') || process.env.NETEASE_COOKIE || '';

if (!UID) {
  console.error('Usage: node scripts/import-netease.js --uid <网易云用户ID> [--cookie "MUSIC_U=xxx"]');
  process.exit(1);
}

// ── API client ──

const WEB_API = 'https://music.163.com/api';
const LOCAL_API = process.env.NETEASE_API_URL || 'http://localhost:3000';

async function webGet(endpoint) {
  const url = `${WEB_API}${endpoint}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://music.163.com/',
  };
  if (COOKIE) headers['Cookie'] = COOKIE;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`${res.status}`);
  }
  return res.json();
}

async function localGet(endpoint) {
  const url = `${LOCAL_API}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Try local first, fall back to web
async function apiGet(endpoint) {
  // Try local API first
  try { return await localGet(endpoint); } catch {}

  // Fall back to direct web API with cookie
  return webGet(endpoint);
}

// ── Track formatting ──
function trackToQuery(track) {
  const name = track.name || '';
  const artist = track.ar?.[0]?.name || '';
  if (artist && name) return `${artist} ${name}`;
  return name || '(unknown)';
}

// ── Main ──
(async () => {
  console.log('[import] Claudio Netease Playlist Importer');
  console.log(`[import] UID: ${UID}`);
  console.log(`[import] Cookie: ${COOKIE ? 'provided' : 'none (trying local API)'}\n`);

  // 1. Get user playlists
  let playlistList;
  try {
    const data = await apiGet(`/user/playlist?uid=${UID}`);
    playlistList = data.playlist || [];
  } catch (err) {
    console.error(`[import] Failed: ${err.message}`);
    console.error('\n[import] 获取歌单失败。请检查:');
    console.error('  1. NeteaseCloudMusicApi 是否已启动 (http://localhost:3000)');
    console.error('  2. 或提供 Cookie: --cookie "MUSIC_U=xxx"');
    console.error('\n  获取 Cookie 方法:');
    console.error('    → 浏览器打开 music.163.com 并登录');
    console.error('    → F12 → Application → Cookies → 复制 MUSIC_U 的值\n');
    process.exit(1);
  }

  if (!playlistList.length) {
    console.log('[import] No playlists found.');
    process.exit(0);
  }

  console.log(`[import] Found ${playlistList.length} playlists:`);
  playlistList.forEach(p => console.log(`  · ${p.name} (${p.trackCount} tracks)`));
  console.log('');

  // 2. Fetch tracks for each playlist
  const result = {};
  let totalTracks = 0;

  for (const pl of playlistList) {
    const name = pl.name || `playlist_${pl.id}`;
    process.stdout.write(`[import] Fetching: ${name} ... `);

    try {
      const detail = await apiGet(`/playlist/detail?id=${pl.id}`);
      const tracks = detail.playlist?.tracks || [];
      result[name] = tracks.map(trackToQuery);
      totalTracks += result[name].length;
      console.log(`${result[name].length} tracks ✓`);
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      result[name] = [];
    }

    await sleep(600);
  }

  // 3. Write to file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n[import] ✅ ${totalTracks} tracks across ${Object.keys(result).length} playlists`);
  console.log(`[import] → ${OUTPUT_PATH}`);

  // 4. Save to state.db
  if (SAVE_STATE) {
    const state = require('../lib/state');
    await state.init();
    state.setPref('netease_uid', UID);
    state.setPref('netease_playlists_updated', new Date().toISOString());
    console.log('[import] UID saved to state.db');
  }
})();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
