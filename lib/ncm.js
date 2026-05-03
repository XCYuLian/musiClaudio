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
async function getPlaylistDetail(playlistId) {
  if (ncmModule) {
    try {
      const res = await callModule('playlist_detail', { id: playlistId });
      return res.body?.playlist || null;
    } catch { /* fall through */ }
  }
  const data = await webGet(`/playlist/detail?id=${playlistId}`);
  return data.playlist || null;
}

/**
 * Resolve a single query to best-matching track + URL.
 */
async function resolveTrack(query) {
  const results = await search(query, 3);
  if (!results.length) return null;
  for (const track of results) {
    const urlInfo = await getSongUrl(track.id);
    if (urlInfo?.url) return { ...track, url: urlInfo.url, br: urlInfo.br };
  }
  return { ...results[0], url: null };
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
