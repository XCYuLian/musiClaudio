/**
 * NETEASE.JS — Netease Cloud Music API wrapper
 *
 * Uses NeteaseCloudMusicApi module directly (no separate server needed).
 * VIP/locked tracks (fee: 1/4) routed through UnblockNeteaseMusic proxy.
 * Falls back to music.163.com web API if module calls fail.
 */

const { MODULE_THROTTLE_MS, SEARCH_LIMIT, BAD_KEYWORDS } = require('../core/config');

const ncmModule = (() => {
  try { return require('NeteaseCloudMusicApi'); } catch { return null; }
})();

const WEB_API = 'https://music.163.com/api';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Cookie helper ──
function getCookie() {
  try {
    const state = require('../core/state');
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
let _moduleThrottled = 0;
async function callModule(name, query = {}) {
  if (!ncmModule) throw new Error('NeteaseCloudMusicApi not installed');
  // Throttle: if rate-limited, skip module calls for 60s
  if (Date.now() - _moduleThrottled < MODULE_THROTTLE_MS) throw new Error('Module throttled');
  const fn = ncmModule[name];
  if (!fn) throw new Error(`Module function "${name}" not found`);
  const cookie = getCookie();
  try {
    const res = await fn({ ...query, ...(cookie ? { cookie } : {}) });
    // Detect rate limit response
    if (res?.body?.code === 405 || res?.status === 405) {
      _moduleThrottled = Date.now();
      throw new Error('Module rate-limited');
    }
    return res;
  } catch (e) {
    // Any error = throttle for 60s, fall back to web API
    _moduleThrottled = Date.now();
    throw e;
  }
}

// ── User profile / VIP verification ──
async function getLoginStatus() {
  try {
    if (!ncmModule) return null;
    const cookie = getCookie();
    if (!cookie) return null;
    const res = await callModule('login_status', {});
    const profile = res.body?.data?.profile || res.body?.profile || null;
    return profile;
  } catch (e) {
    return null;
  }
}

async function getLikedSongs(uid, limit = 100) {
  if (!ncmModule) return [];
  try {
    const res = await callModule('likelist', { uid, limit });
    return (res.body?.ids || []).map(String);
  } catch { return []; }
}

// ── Track formatter ──
function formatTrack(song) {
  // Handle multiple API formats: ar (module), artists/artist (web), or nested
  let artistList = [];
  if (Array.isArray(song.ar) && song.ar.length) {
    artistList = song.ar.map(a => a.name || a).filter(Boolean);
  } else if (Array.isArray(song.artists) && song.artists.length) {
    artistList = song.artists.map(a => typeof a === 'string' ? a : (a.name || a)).filter(Boolean);
  } else if (song.artist) {
    artistList = [typeof song.artist === 'string' ? song.artist : (song.artist.name || '')];
  }
  const artists = artistList.join('/');
  const album = song.al?.name || song.album?.name || song.al?.name || '';
  return {
    id: String(song.id),
    name: song.name || '',
    artists,
    album,
    label: artists ? `${artists} - ${song.name}` : (song.name || '?'),
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
    } catch (e) { /* fall through to web */ }
  }
  // 2. Web fallback
  const data = await webGet(`/cloudsearch/pc?s=${encodeURIComponent(keywords)}&type=1&limit=${limit}`);
  return (data.result?.songs || []).map(formatTrack);
}

// ── Proxy helpers ──

function getProxyUrl() {
  try {
    const p = require('../../lib/proxy');
    return p.isOnline() ? p.getProxyUrl() : null;
  } catch { return null; }
}

/** Fetch song URL through UnblockNeteaseMusic proxy (unlocks VIP tracks). */
async function proxyGetSongUrl(trackId) {
  const pu = getProxyUrl();
  if (!pu) return null;
  try {
    const url = `${pu}/song/url?id=${trackId}&br=999000`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    const info = data.data?.[0];
    if (info?.url && !info.url.includes('music.163.com/404')) {
      return { url: info.url, type: info.type, br: info.br, via: 'proxy' };
    }
  } catch (e) { /* proxy unavailable */ }
  return null;
}

/** Get playable stream URL. VIP priority: Official API → Module → Proxy → Web fallback. */
async function getSongUrl(trackId) {
  const cookie = getCookie();
  const isVip = !!cookie;

  // ── VIP FAST PATH: try official API with high quality FIRST ──
  if (isVip && ncmModule) {
    try {
      let res;
      try {
        res = await callModule('song_url_v1', { id: trackId, level: 'lossless' });
      } catch {
        res = await callModule('song_url', { id: trackId, br: 999000 });
      }
      const info = res.body?.data?.[0];
      if (info?.url) {
        return { url: info.url, type: info.type || 'mp3', br: info.br || 999000, via: 'vip-official' };
      }
    } catch (e) { /* VIP API failed, fall through */ }
  }

  // ── FALLBACK: Module (no VIP) ──
  if (ncmModule && !isVip) {
    try {
      const res = await callModule('song_url', { id: trackId, br: 999000 });
      const info = res.body?.data?.[0];
      if (info?.url && info.fee !== 1 && info.fee !== 4) {
        return { url: info.url, type: info.type, br: info.br, via: 'module' };
      }
      if (info?.url && (info.fee === 1 || info.fee === 4)) {
        const retry = await proxyGetSongUrl(trackId);
        if (retry?.url) return retry;
      }
    } catch (e) { /* fall through to proxy/web */ }
  }

  // ── Proxy fallback (for non-VIP or VIP API failure) ──
  const proxyResult = await proxyGetSongUrl(trackId);
  if (proxyResult?.url) return proxyResult;

  // ── Web fallback (last resort) ──
  try {
    const data = await webGet(`/song/enhance/player/url?id=${trackId}&ids=%5B${trackId}%5D&br=999000`);
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
    } catch (e) { /* no cookie — returns limited data */ }
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
  // Bug 5 fix: if AI specified an artist but track has no artist info, reject
  if (!expected) return true;  // no artist filter → pass
  if (!actual) return false;   // AI expects artist but track has none → reject
  const e = expected.toLowerCase().replace(/\s+/g, '');
  const a = actual.toLowerCase().replace(/\s+/g, '');
  // Must match in BOTH directions (artist in track AND track in artist)
  if (!a.includes(e) && !e.includes(a)) return false;
  // Also check individual parts for compound names like "周杰伦/杨瑞代"
  const ep = e.split('/');
  const ap = a.split('/');
  return ep.some(p => ap.some(q => q.includes(p) || p.includes(q)));
}

async function resolveTrack(query) {
  // Extract artist from query: "Artist - Song" or "Artist Song"
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
  const results = await search(searchQuery, SEARCH_LIMIT);
  if (!results.length) return null;

  // Step 1: Remove bad versions (DJ, remix, live, etc.)
  let clean = results.filter(r => !isBadVersion(r));
  if (!clean.length) return null;

  // Step 2: STRICT artist filter — if AI specified an artist, only consider that artist's tracks
  if (expectedArtist) {
    const strictMatches = clean.filter(t => artistMatch(expectedArtist, t.artists));
    if (strictMatches.length > 0) clean = strictMatches;
  }

  // Step 3: Score & sort remaining candidates
  const scored = clean.map(track => {
    let score = 0;
    if (expectedArtist && artistMatch(expectedArtist, track.artists)) score += 5;
    const qLower = query.toLowerCase();
    const songPart = qLower.split(/\s+/).pop() || '';
    if (track.name && track.name.toLowerCase().includes(songPart)) score += 3;
    if (track.name && songPart && track.name.toLowerCase() === songPart) score += 5;
    return { track, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Step 4: Try candidates, check duration
  for (const { track } of scored) {
    const origDur = results[0]?.dt;
    if (origDur && track.dt) {
      const diff = Math.abs((track.dt - origDur) / 1000);
      if (diff > 8) continue;
    }
    const urlInfo = await getSongUrl(track.id);
    if (urlInfo?.url) return { ...track, url: urlInfo.url, br: urlInfo.br };
  }

  // Step 5: No good match
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
      console.error(`[netease] Failed to resolve "${q}":`, err.message);
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

/**
 * Emergency URL: skip proxy/module/VIP checks. Web-only, any quality, no filter.
 * Used ONLY for hard fallback when everything else failed.
 */
async function getEmergencyUrl(trackId) {
  try {
    const data = await webGet(`/song/enhance/player/url?id=${trackId}&ids=%5B${trackId}%5D&br=128000`);
    const info = data.data?.[0];
    // Accept ANY URL, even low quality — better than silence
    if (info?.url) return { url: info.url, type: info.type, br: info.br, via: 'emergency' };
  } catch {}
  // Last resort: try the ancient API
  try {
    const cookie = getCookie();
    const headers = { 'User-Agent': UA, 'Referer': 'https://music.163.com/' };
    if (cookie) headers['Cookie'] = cookie;
    const res = await fetch(`https://music.163.com/api/song/enhance/player/url?id=${trackId}&ids=%5B${trackId}%5D&br=128000`, { headers });
    const data = await res.json();
    const info = data.data?.[0];
    if (info?.url) return { url: info.url, type: info.type, br: info.br, via: 'emergency-legacy' };
  } catch {}
  return null;
}

module.exports = {
  search, getSongUrl, getEmergencyUrl, getLyric, getSongDetail,
  getUserPlaylists, getPlaylistDetail, getLoginStatus, getLikedSongs,
  resolveTrack, resolvePlaylist, ping,
};
