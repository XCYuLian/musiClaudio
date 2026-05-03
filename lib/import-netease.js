/**
 * IMPORT-NETEASE.JS — 网易云歌单导入（可复用模块）
 *
 * Uses ncm.js module (NeteaseCloudMusicApi npm package) directly.
 * Defaults to "我喜欢的音乐" only, 1500 tracks max, sorted by artist+title.
 * Outputs to data/playlists/liked_songs.json
 */

const fs = require('fs');
const path = require('path');
const ncm = require('./ncm');
const paths = require('./paths');
const { getUserPlaylists, getPlaylistDetail } = ncm;

const DEFAULT_MAX_TRACKS = 1500;

// ── Track formatting & sorting ──

function trackToEntry(track) {
  const name = (track.name || '').trim();
  const artist = (track.ar?.[0]?.name || '').trim();
  if (artist && name) return `${artist} - ${name}`;
  if (name) return name;
  return '(unknown)';
}

function sortTracks(tracks) {
  return tracks.sort((a, b) => {
    const artistA = (a.ar?.[0]?.name || '').toLowerCase();
    const artistB = (b.ar?.[0]?.name || '').toLowerCase();
    if (artistA !== artistB) return artistA.localeCompare(artistB, 'zh-Hans');
    return (a.name || '').localeCompare(b.name || '', 'zh-Hans');
  });
}

// ── Main import ──

async function importPlaylists(uid, cookie = '', options = {}, onProgress = null) {
  const { allPlaylists = false, maxTracks = DEFAULT_MAX_TRACKS, outputDir = null } = options;

  const log = (phase, message, current, total) => {
    if (onProgress) onProgress({ phase, message, current, total });
  };

  // 1. Get user playlists
  log('playlists', 'Fetching playlist list...');

  let playlistList;
  try {
    playlistList = await getUserPlaylists(uid);
  } catch (err) {
    throw new Error(`Cannot reach Netease API: ${err.message}. Make sure NeteaseCloudMusicApi is installed (npm install).`);
  }

  if (!playlistList.length) {
    throw new Error('No playlists found. This account may have no public playlists. Add a MUSIC_U cookie in Settings or .env for private access.');
  }

  // 2. Determine target playlists
  let targets;
  if (allPlaylists) {
    targets = playlistList;
    log('playlists', `Found ${targets.length} playlists (all)`, 0, targets.length);
  } else {
    const liked = playlistList.find(pl => pl.specialType === 5);
    if (!liked) {
      const fallback = playlistList.find(pl => !pl.subscribed && String(pl.userId) === String(uid));
      if (!fallback) {
        throw new Error('Cannot find "我喜欢的音乐". Try adding a cookie or enter a playlist ID/link instead.');
      }
      targets = [fallback];
    } else {
      targets = [liked];
    }
    log('playlists', `Target: "${targets[0].name}" (${targets[0].trackCount} tracks)`, 0, 1);
  }

  // 3. Fetch tracks
  const allTracks = [];
  for (let i = 0; i < targets.length; i++) {
    const pl = targets[i];
    const name = pl.name || `playlist_${pl.id}`;
    log('tracks', `Fetching: ${name}`, i + 1, targets.length);

    try {
      const detail = await getPlaylistDetail(pl.id);
      const tracks = detail?.tracks || [];
      allTracks.push(...tracks);
      log('tracks', `${name}: ${tracks.length} tracks`, i + 1, targets.length);
    } catch (err) {
      log('tracks', `SKIP: ${name} (${err.message})`, i + 1, targets.length);
    }
  }

  if (!allTracks.length) {
    throw new Error('All playlists returned 0 tracks. The playlists may be private — add a cookie in Settings.');
  }

  // 4. Cap and format (keep API order — most-recently-liked first)
  const capped = allTracks.slice(0, maxTracks);
  log('sort', `Keeping API order for ${capped.length} tracks (most recent first)...`);
  const entries = capped.map(trackToEntry);

  // 5. Write output
  const outPath = paths.PLAYLIST_FILE;
  if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), 'utf-8');

  log('done', `Done: ${entries.length} tracks → ${outPath}`);

  return { tracks: entries, totalTracks: entries.length, playlistCount: targets.length, outputPath: outPath };
}

async function importPlaylistById(playlistId, cookie = '', options = {}, onProgress = null) {
  const { maxTracks = DEFAULT_MAX_TRACKS } = options;
  const log = (phase, message) => {
    if (onProgress) onProgress({ phase, message });
  };

  log('tracks', 'Fetching playlist...');
  const detail = await getPlaylistDetail(playlistId);
  if (!detail) throw new Error(`Playlist ${playlistId} not found or is private.`);
  const tracks = detail.tracks || [];
  if (!tracks.length) throw new Error(`Playlist "${detail.name}" is empty or private.`);

  log('tracks', `${detail.name}: ${tracks.length} tracks`);
  const capped = tracks.slice(0, maxTracks);
  log('sort', `Keeping API order for ${capped.length} tracks...`);
  const entries = capped.map(trackToEntry);

  const outPath = paths.PLAYLIST_FILE;
  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2), 'utf-8');

  log('done', `Done: ${entries.length} tracks → ${outPath}`);
  return { tracks: entries, totalTracks: entries.length, playlistCount: 1, playlistName: detail.name, outputPath: outPath };
}

module.exports = { importPlaylists, importPlaylistById };
