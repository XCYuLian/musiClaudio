/**
 * SCHEDULER.JS — Cron + auto-start (V2)
 */

const cron = require('node-cron');
const { buildContext } = require('./context');
const { askDeepSeek } = require('../api/deepseek');
const { synthesize } = require('../api/tts');
const ncm = require('../api/netease');
const state = require('./state');

let onTask = null;

// ── Scheduler circuit breaker (Plan 2: stop AI loop when search keeps failing) ──
let _schedulerFailStreak = 0;
const MAX_SCHEDULER_FAILS = 1;  // ONE failure → lock down ALL cron tasks
// Hardcoded FREE Netease track IDs (confirmed non-VIP, any quality OK via emergency)
const HARD_FALLBACK_IDS = [
  { id: '1813926546', name: 'Lo-Fi Chill', artist: 'Lofi' },
  { id: '19500000',   name: 'Ambient',     artist: 'Ambient' },
  { id: '523365012',  name: '轻音乐',      artist: '钢琴曲' },
];

function setCallback(fn) { onTask = fn; }
function broadcast(data) { if (onTask) onTask(data); }

// Get a playable track from hardcoded free IDs using EMERGENCY URL (no VIP check)
async function resolveHardFallback() {
  const shuffled = [...HARD_FALLBACK_IDS].sort(() => Math.random() - 0.5);
  for (const fb of shuffled) {
    try {
      const info = await ncm.getEmergencyUrl(fb.id);  // skip VIP check
      if (info?.url) {
        return { id: fb.id, name: fb.name, artists: fb.artist,
          label: `${fb.artist} - ${fb.name}`, url: info.url, album: '' };
      }
    } catch {}
  }
  return null;
}

async function runTask({ trigger, userInput, executionTrace }) {
  try {
    // Circuit breaker: if search keeps failing, skip DeepSeek entirely
    if (_schedulerFailStreak >= MAX_SCHEDULER_FAILS) {
      console.log(`[scheduler] Circuit OPEN (${_schedulerFailStreak} fails) — hard fallback`);
      const track = await resolveHardFallback();
      if (track) {
        broadcast({ type: 'scheduled', trigger, speech: 'AI 暂时休息，为你播首经典。',
          action_type: 'change_song', search_query: track.label, tracks: [track], tts: null });
        _schedulerFailStreak = 0;
      } else {
        console.log('[scheduler] Hard fallback all failed — dead air, waiting for user');
        _schedulerFailStreak++;
      }
      return;
    }

    console.log(`[scheduler] ${trigger}`);
    const s = state.getState();
    const { systemPrompt, userMessage } = await buildContext({
      userInput, state: s, executionTrace, intent: 'auto',
    });
    const result = await askDeepSeek(systemPrompt, userMessage);
    const speech = result.dj_speech || result.speech || result.monologue || result.say || '';
    const query = result.search_query || result.play?.[0] || null;

    // Resolve tracks
    let tracks = [];
    if (query) {
      try {
        tracks = await ncm.resolvePlaylist([query]);
        tracks = filterRepeats(tracks);
      } catch (e) { console.error('[scheduler] resolve:', e.message); }
    }
    if (!tracks.length) {
      console.log('[scheduler] No tracks after filter — trying hard fallback');
      // Try hard fallback immediately instead of going silent
      const hard = await resolveHardFallback();
      if (hard) {
        tracks = [hard];
        console.log(`[scheduler] Hard fallback: ${hard.label}`);
      }
      _schedulerFailStreak++;
    } else {
      _schedulerFailStreak = 0; // reset on success
    }

    // TTS
    let tts = null;
    try {
      const p = await synthesize(speech);
      if (p) tts = 'data:audio/mp3;base64,' + require('fs').readFileSync(p).toString('base64');
    } catch (e) { console.error('[scheduler] tts:', e.message); }

    // Record
    state.addMessage('system', `[${trigger}]`);
    state.addMessage('assistant', speech, {});
    if (tracks.length) tracks.forEach(t => state.addPlay(t.label || t.name, 'ai'));
    if (query) state.addPlay(query, 'ai-query');

    broadcast({ type: 'scheduled', trigger, speech, action_type: 'change_song', search_query: query, tracks, tts });
    console.log(`[scheduler] OK: "${speech.slice(0, 50)}" | tracks: ${tracks.length}`);
    return result;
  } catch (e) {
    console.error(`[scheduler] FAIL (${trigger}):`, e.message);
    return null;
  }
}

function filterRepeats(tracks) {
  if (!tracks.length) return tracks;
  const BLOCKED = ['bonobo','toe','uyama hiroto','nujabes','dj okawari'];
  try {
    const recent = state.getRecentPlays24h(200);
    const recentArtists = new Set();
    const recentTracks = new Set();
    recent.forEach(p => {
      const t = (p.track || '').toLowerCase().trim();
      if (!t) return;
      recentTracks.add(t);
      const dash = t.indexOf(' - ');
      if (dash > 0) {
        recentArtists.add(t.slice(0, dash).trim());
      } else {
        const space = t.indexOf(' ');
        if (space > 0) recentArtists.add(t.slice(0, space).trim());
      }
    });
    BLOCKED.forEach(a => recentArtists.add(a));
    const filtered = tracks.filter(t => {
      const label = (t.label || t.name || '').toLowerCase().trim();
      const artist = (t.artists || '').toLowerCase().trim();
      if (recentTracks.has(label)) return false;
      // Only filter by artist if artist is specific (>= 3 chars, not generic)
      if (artist && artist.length >= 3 && [...recentArtists].some(x => x.length >= 3 && (artist.includes(x) || x.includes(artist)))) return false;
      return true;
    });
    // NEVER kill all tracks — if filter removed everything, keep the first one
    if (!filtered.length && tracks.length) {
      console.log('[scheduler] filterRepeats would remove all — keeping first track');
      return [tracks[0]];
    }
    return filtered;
  } catch { return tracks; }
}

function start() {
  cron.schedule('0 7 * * *', () => runTask({ trigger: 'daily', userInput: '早安播报', executionTrace: 'daily-7am' }));
  cron.schedule('0 9 * * *', () => runTask({ trigger: 'morning', userInput: '上午音乐', executionTrace: 'morning-9am' }));
  cron.schedule('0 7-23 * * *', () => {
    if (_schedulerFailStreak >= MAX_SCHEDULER_FAILS) return;
    const h = new Date().getHours();
    const p = h < 10 ? '早上音乐检查' : h < 12 ? '上午氛围' : h < 14 ? '午餐放松' : h < 17 ? '午后提神' : h < 19 ? '傍晚切换' : '晚间舒缓';
    runTask({ trigger: 'hourly', userInput: p, executionTrace: 'hourly' });
  });

  // ── DJ Proactive: 10-min idle → 20% chance, night silence 1-6am ──
  setInterval(() => {
    const h = new Date().getHours();
    if (h >= 1 && h < 6) return;         // night silence
    if (_schedulerFailStreak >= MAX_SCHEDULER_FAILS) return;
    const lastChat = state.getPref('last_chat_time') || 0;
    const idleMin = (Date.now() - lastChat) / 60000;
    if (idleMin < 10) return;
    if (Math.random() > 0.20) return;
    const liked = state.getPref('liked_songs_sample') || state.getPref('liked_artists') || '';
    const hint = liked
      ? `用户偏爱: ${liked.slice(0, 40)}。用20字内聊一句，action_type=chat_only，绝不切歌。`
      : '用15字内闲聊一句，action_type=chat_only，绝不切歌。';
    runTask({ trigger: 'proactive', userInput: `(DJ插嘴) 已${Math.round(idleMin)}分钟无操作。${hint}`, executionTrace: 'proactive' });
  }, 5 * 60 * 1000);

  console.log('[scheduler] Started');
}

function stop() { console.log('[scheduler] Stopped'); }

async function triggerNow(trigger, userInput) {
  return runTask({ trigger, userInput, executionTrace: trigger });
}

module.exports = { start, stop, setCallback, triggerNow };
