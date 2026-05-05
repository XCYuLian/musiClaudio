/**
 * NETEASE.JS — Netease Cloud Music API wrapper
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
    const state = require('../core/state');
    const cookie = state.getPref('netease_cookie') || process.env.NETEASE_COOKIE || '';
    if (cookie) console.log('[netease] cookie injected:', cookie.substring(0, 30) + '...');
    return cookie;
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
  if (Date.now() - _moduleThrottled < 60000) throw new Error('Module throttled');
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
    if (profile?.nickname) {
      console.log(`[netease] Logged in as: ${profile.nickname} (VIP: ${profile.vipType > 0 ? 'yes' : 'no'})`);
    }
    return profile;
  } catch (e) {
    console.log('[netease] Not logged in:', e.message);
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
    } catch (e) { if (!e.message?.includes('throttled')) console.log('[netease] module search failed:', e.message); }
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
  } catch (e) { console.log('[netease] proxy URL failed:', e.message); }
  return null;
}

/** Get playable stream URL. VIP priority: Official API → Module → Proxy → Web fallback. */
async function getSongUrl(trackId) {
  const cookie = getCookie();
  const isVip = !!cookie;

  // ── VIP FAST PATH: try official API with high quality FIRST ──
  if (isVip && ncmModule) {
    try {
      console.log(`[netease] VIP 身份检测成功，正在请求官方高码率音源...`);
      // Try song_url_v1 with lossless level first
      let res;
      try {
        res = await callModule('song_url_v1', { id: trackId, level: 'lossless' });
      } catch {
        res = await callModule('song_url', { id: trackId, br: 999000 });
      }
      const info = res.body?.data?.[0];
      if (info?.url) {
        // VIP users can play ANY song — fee check is irrelevant
        console.log(`[netease] ✅ VIP 官方音源获取成功！直连播放 (fee=${info.fee}, br=${info.br})`);
        return { url: info.url, type: info.type || 'mp3', br: info.br || 999000, via: 'vip-official' };
      }
    } catch (e) { console.log('[netease] VIP official API failed:', e.message); }
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
        console.log(`[netease] Track ${trackId} is VIP (fee=${info.fee}), proxy fallback...`);
        const retry = await proxyGetSongUrl(trackId);
        if (retry?.url) return retry;
      }
    } catch (e) { if (!e.message?.includes('throttled')) console.log('[netease] module song_url failed:', e.message); }
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
    } catch (e) {
      // If no cookie, user_playlist returns limited data
      console.log('[netease] module user_playlist (limited):', e.message);
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

const BAD_KEYWORDS = ['dj', 'remix', 'live', '现场', '翻唱', '翻自', '伴奏', '串烧', '铃声', '抖音', 'cover', 'sped up', 'mix', 'dj版', 'remix版', '合唱', '纯音乐', 'instrumental', 'karaoke', '消音', '模仿', '改编', '翻奏', '粤语版', '国语版', '英文版', '日语版', '韩语版', '变奏', '慢摇'];

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
  const results = await search(searchQuery, 15);
  if (!results.length) return null;
  console.log(`[netease] resolveTrack("${query}"): ${results.length} search results`);
  if (expectedArtist) console.log(`[netease] Expected artist: "${expectedArtist}"`);

  // Step 1: Remove bad versions (DJ, remix, live, etc.)
  let clean = results.filter(r => !isBadVersion(r));
  if (!clean.length) {
    console.log(`[netease] All ${results.length} results filtered as bad versions for "${query}"`);
    return null;
  }

  // Step 2 (NEW): STRICT artist filter — if AI specified an artist, only consider that artist's tracks
  if (expectedArtist) {
    const strictMatches = clean.filter(t => artistMatch(expectedArtist, t.artists));
    if (strictMatches.length > 0) {
      console.log(`[netease] Strict artist "${expectedArtist}": ${strictMatches.length}/${clean.length} matches`);
      clean = strictMatches;
    } else {
      // No exact match — use loose results (artist name might be non-standard)
      console.log(`[netease] No strict match for "${expectedArtist}" — trying loose results (${clean.length} tracks)`);
      // Don't return null, use clean results with lower confidence
    }
  }

  // Step 3: Score & sort remaining candidates
  const scored = clean.map(track => {
    let score = 0;
    if (expectedArtist && artistMatch(expectedArtist, track.artists)) score += 5;
    const qLower = query.toLowerCase();
    const songPart = qLower.split(/\s+/).pop() || '';
    if (track.name && track.name.toLowerCase().includes(songPart)) score += 3;
    // Boost tracks where song name closely matches the query's song part
    if (track.name && songPart && track.name.toLowerCase() === songPart) score += 5;
    return { track, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Step 4: Try candidates, check duration
  for (const { track } of scored) {
    const origDur = results[0]?.dt;
    if (origDur && track.dt) {
      const diff = Math.abs((track.dt - origDur) / 1000);
      if (diff > 8) {
        console.log(`[netease] Duration mismatch for "${track.label}": diff=${diff}s, skipping`);
        continue;
      }
    }
    const urlInfo = await getSongUrl(track.id);
    if (urlInfo?.url) return { ...track, url: urlInfo.url, br: urlInfo.br };
  }

  // Step 5: No good match — return null
  console.log(`[netease] No playable source for "${query}"`);
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
