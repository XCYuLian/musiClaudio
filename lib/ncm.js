/**
 * NCM.JS — Netease Cloud Music API wrapper
 *
 * Requires NeteaseCloudMusicApi running locally (default :3000).
 *
 * Endpoints used:
 *   /search?keywords=...&limit=N    → 歌曲搜索
 *   /song/url?id=xxx                → 获取可播放直链
 *   /lyric?id=xxx                   → 获取歌词
 *   /song/detail?ids=xxx            → 歌曲详情
 */

const NETEASE_URL = process.env.NETEASE_API_URL || 'http://localhost:3000';

// ── Helpers ──

async function apiGet(endpoint) {
  const url = `${NETEASE_URL}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Netease API ${res.status} at ${endpoint}`);
  }
  return res.json();
}

function formatTrack(song) {
  const artists = (song.ar || []).map(a => a.name).join('/');
  const album = song.al?.name || '';
  return {
    id: String(song.id),
    name: song.name,
    artists,
    album,
    label: artists ? `${artists} - ${song.name}` : song.name,
    albumLabel: album ? ` (${album})` : '',
  };
}

// ── Public API ──

/**
 * Search for tracks. Returns up to `limit` formatted results.
 */
async function search(keywords, limit = 10) {
  const data = await apiGet(`/search?keywords=${encodeURIComponent(keywords)}&limit=${limit}`);
  const songs = data.result?.songs || [];
  return songs.map(formatTrack);
}

/**
 * Get a playable stream URL for a track ID.
 * Returns { url, type, freeTrialInfo } or null.
 */
async function getSongUrl(trackId) {
  const data = await apiGet(`/song/url?id=${trackId}`);
  const info = data.data?.[0];
  if (!info || !info.url) return null;
  return {
    url: info.url,
    type: info.type,
    br: info.br,         // bitrate in kbps
    size: info.size,
  };
}

/**
 * Get lyrics for a track ID.
 */
async function getLyric(trackId) {
  const data = await apiGet(`/lyric?id=${trackId}`);
  return {
    lyric: data.lrc?.lyric || '',
    tlyric: data.tlyric?.lyric || '',  // translated lyric
  };
}

/**
 * Get song details (cover image, etc.)
 */
async function getSongDetail(trackIds) {
  const ids = Array.isArray(trackIds) ? trackIds.join(',') : trackIds;
  const data = await apiGet(`/song/detail?ids=${ids}`);
  return (data.songs || []).map(formatTrack);
}

/**
 * Resolve a search query to the best-matching track + playable URL.
 * Used when the LLM returns track queries like "toe Goodbye".
 */
async function resolveTrack(query) {
  const results = await search(query, 3);
  if (!results.length) return null;

  // Try up to 3 results, return the first one with a playable URL
  for (const track of results) {
    const urlInfo = await getSongUrl(track.id);
    if (urlInfo) {
      return { ...track, url: urlInfo.url, br: urlInfo.br };
    }
  }

  // Fallback: return the top result even without a URL
  return { ...results[0], url: null };
}

/**
 * Resolve multiple queries from LLM output (the `play[]` field).
 * Returns array of resolved tracks, skipping unresolvable ones.
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

// ── Health check ──
async function ping() {
  try {
    await apiGet('/search?keywords=test&limit=1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { search, getSongUrl, getLyric, getSongDetail, resolveTrack, resolvePlaylist, ping };
