/**
 * NCM.JS — Netease Cloud Music API wrapper
 *
 * Uses NeteaseCloudMusicApi module directly (no separate server needed).
 * VIP/locked tracks (fee: 1/4) routed through UnblockNeteaseMusic proxy.
 * Falls back to music.163.com web API if module calls fail.
 */

const ncmModule = (() => {
  try { return require('NeteaseCloudMusicApi'); } catch { return null; }
})();

const WEB_API = 'https://music.163.com/api';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Cookie helper ──
function getCookie() {
  try {
    const state = require('./state');
    return state.getPref('netease_cookie') || process.env.NETEASE_COOKIE || '';
  } catch { return process.env.NETEASE_COOKIE || ''; }
}

// ── Web API fallback ──
async function webGet(endpoint) {
  const cookie = getCookie();
  const headers = { 'User-Agent': UA, 'Referer': 'https://music.163.com/' };
  if (cookie) headers['Cookie'] = cookie;
  const url = `${WEB_API}${endpoint}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Module caller: pass query + cookie ──
async function callModule(name, query = {}) {
  if (!ncmModule) throw new Error('NeteaseCloudMusicApi not installed');
  const fn = ncmModule[name];
  if (!fn) throw new Error(`Module function "${name}" not found`);
  const cookie = getCookie();
  return fn({ ...query, ...(cookie ? { cookie } : {}) });
}

// ── Track formatter ──
function formatTrack(song) {
  const artists = (song.ar || []).map(a => a.name).join('/');
  const album = song.al?.name || '';
  return {
    id: String(song.id),
    name: song.name,
    artists,
    album,
    label: artists ? `${artists} - ${song.name}` : song.name,
  };
}

// ── Public API ──

/** Search for tracks. Module → web fallback. */
async function search(keywords, limit = 10) {
  // 1. Try module
  if (ncmModule) {
    try {
      const res = await callModule('search', { keywords, limit, type: 1 });
      return (res.body?.result?.songs || []).map(formatTrack);
    } catch (e) { console.log('[ncm] module search failed:', e.message); }
  }
  // 2. Web fallback
  const data = await webGet(`/cloudsearch/pc?s=${encodeURIComponent(keywords)}&type=1&limit=${limit}`);
  return (data.result?.songs || []).map(formatTrack);
}

// ── Proxy helpers ──

function getProxyUrl() {
  try {
    const p = require('./proxy');
    return p.isOnline() ? p.getProxyUrl() : null;
  } catch { return null; }
}

/** Fetch song URL through UnblockNeteaseMusic proxy (unlocks VIP tracks). */
async function proxyGetSongUrl(trackId) {
  const pu = getProxyUrl();
  if (!pu) return null;
  try {
    const url = `${pu}/song/url?id=${trackId}&br=320000`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const info = data.data?.[0];
    if (info?.url && !info.url.includes('music.163.com/404')) {
      return { url: info.url, type: info.type, br: info.br, via: 'proxy' };
    }
  } catch (e) { console.log('[ncm] proxy URL failed:', e.message); }
  return null;
}

/** Get playable stream URL. Proxy (VIP unlock) → Module → Web fallback. */
async function getSongUrl(trackId) {
  // 1. Try proxy first (unlocks VIP)
  const proxyResult = await proxyGetSongUrl(trackId);
  if (proxyResult?.url) return proxyResult;

  // 2. Try module
  if (ncmModule) {
    try {
      const res = await callModule('song_url', { id: trackId, br: 320000 });
      const info = res.body?.data?.[0];
      // Check if VIP-limited
      if (info?.url && info.fee !== 1 && info.fee !== 4) {
        return { url: info.url, type: info.type, br: info.br, via: 'module' };
      }
      if (info?.url && (info.fee === 1 || info.fee === 4)) {
        console.log(`[ncm] Track ${trackId} is VIP (fee=${info.fee}), trying alternatives...`);
        // Try proxy again even if first attempt failed
        const retry = await proxyGetSongUrl(trackId);
        if (retry?.url) return retry;
      }
    } catch (e) { console.log('[ncm] module song_url failed:', e.message); }
  }
  // 3. Web fallback
  try {
    const data = await webGet(`/song/enhance/player/url?id=${trackId}&ids=%5B${trackId}%5D&br=320000`);
    const info = data.data?.[0];
    if (info?.url) return { url: info.url, type: info.type, br: info.br, via: 'web' };
  } catch { /* no URL available */ }
  return null;
}

/** Get lyrics. */
async function getLyric(trackId) {
  if (ncmModule) {
    try {
      const res = await callModule('lyric', { id: trackId });
      return { lyric: res.body?.lrc?.lyric || '', tlyric: res.body?.tlyric?.lyric || '' };
    } catch { /* fall through */ }
  }
  try {
    const data = await webGet(`/song/lyric?id=${trackId}`);
    return { lyric: data.lrc?.lyric || '', tlyric: data.tlyric?.lyric || '' };
  } catch { return { lyric: '', tlyric: '' }; }
}

/** Get song details. */
async function getSongDetail(trackIds) {
  const ids = Array.isArray(trackIds) ? trackIds.join(',') : trackIds;
  if (ncmModule) {
    try {
      const res = await callModule('song_detail', { ids });
      return (res.body?.songs || []).map(formatTrack);
    } catch { /* fall through */ }
  }
  const data = await webGet(`/song/detail?ids=${ids}`);
  return (data.songs || []).map(formatTrack);
}

/**
 * Get user playlists. Module (auth required) or web.
 */
async function getUserPlaylists(uid) {
  if (ncmModule) {
    try {
      const res = await callModule('user_playlist', { uid });
      return res.body?.playlist || [];
    } catch (e) {
      // If no cookie, user_playlist returns limited data
      console.log('[ncm] module user_playlist (limited):', e.message);
    }
  }
  // Web fallback
  try {
    const data = await webGet(`/user/playlist?uid=${uid}`);
    if (data.code === 200) return data.playlist || [];
  } catch { /* unreachable */ }
  return [];
}

/**
 * Get playlist detail (tracks). Works without auth for public playlists.
 */
async function getPlaylistDetail(playlistId, limit = 1000, offset = 0) {
  if (ncmModule) {
    try {
      const res = await callModule('playlist_detail', { id: playlistId, limit, offset });
      return res.body?.playlist || null;
    } catch { /* fall through */ }
  }
  const data = await webGet(`/playlist/detail?id=${playlistId}&limit=${limit}&offset=${offset}`);
  return data.playlist || null;
}

/**
 * Resolve a single query to best-matching track + URL.
 */
// ── Quality filters ──

const BAD_KEYWORDS = ['dj', 'remix', 'live', '现场', '翻唱', '伴奏', '串烧', '铃声', '抖音', 'cover', 'sped up', 'mix', 'dj版', 'remix版', '合唱', '纯音乐', 'instrumental', 'karaoke', '消音'];

function isBadVersion(track) {
  const check = (s) => {
    if (!s) return false;
    const lower = s.toLowerCase();
    return BAD_KEYWORDS.some(kw => lower.includes(kw));
  };
  if (check(track.name)) return true;
  if (check(track.album)) return true;
  if (track.al?.name && check(track.al.name)) return true;
  // Check artists for "翻唱" tag
  if (track.artists && check(track.artists)) return true;
  return false;
}

function artistMatch(expected, actual) {
  if (!expected || !actual) return true;
  const e = expected.toLowerCase().replace(/\s+/g, '');
  const a = actual.toLowerCase().replace(/\s+/g, '');
  if (a.includes(e) || e.includes(a)) return true;
  const ep = e.split('/');
  const ap = a.split('/');
  return ep.some(p => ap.some(q => q.includes(p) || p.includes(q)));
}

async function resolveTrack(query) {
  // Extract artist from query: "Artist - Song"
  let expectedArtist = '';
  let searchQuery = query;
  const dashIdx = query.indexOf(' - ');
  if (dashIdx > 0) {
    expectedArtist = query.slice(0, dashIdx).trim();
  } else {
    const parts = query.trim().split(/\s+/);
    if (parts.length >= 2) expectedArtist = parts[0];
  }

  // Search, get more results for filtering
  const results = await search(searchQuery, 10);
  if (!results.length) return null;

  // Step 1: Remove bad versions (DJ, remix, live, etc.)
  const clean = results.filter(r => !isBadVersion(r));
  if (!clean.length) {
    console.log(`[ncm] All ${results.length} results filtered as bad versions for "${query}"`);
    return null; // Absolute fallback: skip rather than play DJ version
  }

  // Step 2: Score & sort
  const scored = clean.map(track => {
    let score = 0;
    if (expectedArtist && track.artists && artistMatch(expectedArtist, track.artists)) score += 10;
    const qLower = query.toLowerCase();
    if (track.name && track.name.toLowerCase().includes(qLower.split(/\s+/).pop() || '')) score += 3;
    return { track, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Step 3: Try candidates, check duration
  for (const { track } of scored) {
    // Duration check: if we have original duration, compare
    const origDur = results[0]?.dt; // reference from first search result
    if (origDur && track.dt) {
      const diff = Math.abs((track.dt - origDur) / 1000);
      if (diff > 8) {
        console.log(`[ncm] Duration mismatch for "${track.label}": diff=${diff}s, skipping`);
        continue;
      }
    }
    const urlInfo = await getSongUrl(track.id);
    if (urlInfo?.url) return { ...track, url: urlInfo.url, br: urlInfo.br };
  }

  // Step 4: No good match — return null rather than play bad version
  console.log(`[ncm] No clean playable source for "${query}" after filtering`);
  return null;
}

/**
 * Resolve multiple queries.
 */
async function resolvePlaylist(queries) {
  const resolved = [];
  for (const q of queries) {
    try {
      const track = await resolveTrack(q);
      if (track) resolved.push(track);
    } catch (err) {
      console.error(`[ncm] Failed to resolve "${q}":`, err.message);
    }
  }
  return resolved;
}

/**
 * Health check — just tests if search works.
 */
async function ping() {
  if (ncmModule) {
    try {
      await callModule('search', { keywords: 'test', limit: 1, type: 1 });
      return { ok: true, source: 'module' };
    } catch { /* fall through */ }
  }
  try {
    await webGet('/cloudsearch/pc?s=test&type=1&limit=1');
    return { ok: true, source: 'web' };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  search, getSongUrl, getLyric, getSongDetail,
  getUserPlaylists, getPlaylistDetail,
  resolveTrack, resolvePlaylist, ping,
};
