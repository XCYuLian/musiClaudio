/**
 * SCHEDULER.JS — Cron + auto-start (V2)
 */

const cron = require('node-cron');
const { buildContext } = require('./context');
const { askDeepSeek } = require('../api/deepseek');
const { synthesize } = require('../api/tts');
const ncm = require('../api/netease');
const state = require('./state');
const { MAX_SCHEDULER_FAILS, HARD_FALLBACK_IDS } = require('./config');

let onTask = null;

// ── Scheduler circuit breaker ──
let _schedulerFailStreak = 0;

function setCallback(fn) { onTask = fn; }
function broadcast(data) { if (onTask) onTask(data); }

async function runTask({ trigger, userInput, executionTrace }) {
  console.log(`[scheduler] runTask trigger=${trigger} input="${(userInput||'').slice(0,40)}..."`);
  try {
    // Circuit breaker: if search keeps failing, skip DeepSeek entirely
    if (_schedulerFailStreak >= MAX_SCHEDULER_FAILS) {
      console.log(`[scheduler] Circuit OPEN (${_schedulerFailStreak} fails) — hard fallback`);
      const track = await ncm.resolveHardFallback(HARD_FALLBACK_IDS);
      if (track) {
        state.addPlay(track.label || track.name, 'ai');
        broadcast({ type: 'scheduled', trigger, speech: 'AI 暂时休息，为你播首经典。',
          action_type: 'change_song', search_query: track.label, tracks: [track], tts: null });
        _schedulerFailStreak = 0;
      } else {
        console.log('[scheduler] Hard fallback all failed — dead air, waiting for user');
        _schedulerFailStreak++;
      }
      return;
    }

    // Proactive chat: chat_only, no track resolution
    if (trigger === 'proactive') {
      return runChatTask({ trigger, userInput, executionTrace });
    }

    // Pre-search Netease: give AI real songs to pick from
    const nicheTags = [
      'City Pop', 'Neo-Soul', 'Jazz Fusion', 'Lo-fi Hip Hop', 'Dream Pop',
      'Trip-Hop', 'Bossa Nova', 'Chillwave', 'Synthwave', 'Indie Folk',
      'Math Rock', 'Afrobeat', 'Funk Soul', 'Psychedelic Rock', 'Ambient',
    ];
    const tag1 = nicheTags[Math.floor(Math.random() * nicheTags.length)];
    const modifiers = ['精选', '冷门', '小众', '独立', '地下', '氛围', '深夜', '迷幻', '治愈', '律动'];
    const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
    const searchQuery = `${tag1} ${mod}`;
    let preSearchResults = '';
    let preSearchTracks = [];
    try {
      let results = await ncm.search(searchQuery, 8);
      if (!results.length) results = await ncm.search(tag1, 8);
      preSearchTracks = results;
      preSearchResults = results.map((t, i) => `${i + 1}. ${t.label}`).join('\n');
    } catch { /* pre-search optional */ }

    const s = state.getState();
    const { systemPrompt, userMessage } = await buildContext({
      userInput, state: s, executionTrace, intent: 'auto', preSearchResults,
    });
    const result = await askDeepSeek(systemPrompt, userMessage);
    const speech = result.dj_speech || result.speech || result.monologue || result.say || '';
    const query = result.search_query || result.play?.[0] || null;
    const isFallback = result._meta?.fallback;

    // Fast path: AI fallback → skip flaky search + TTS, use hard fallback directly
    if (isFallback) {
      const hard = await ncm.resolveHardFallback(HARD_FALLBACK_IDS);
      if (hard) {
        state.addPlay(hard.label || hard.name, 'ai');
        broadcast({ type: 'scheduled', trigger, speech: 'AI 暂时休息，为你播首经典。',
          action_type: 'change_song', search_query: hard.label, tracks: [hard], tts: null });
        _schedulerFailStreak = 0;
        return;
      }
    }

    // Resolve tracks — use pre-search match if available (skip re-search)
    let tracks = [];
    if (query) {
      const norm = (s) => (s||'').toLowerCase().replace(/ - /g, ' ').replace(/\s+/g, ' ').trim();
      const qNorm = norm(query);
      const preMatch = preSearchTracks.find(t => {
        const tNorm = norm(t.label);
        return tNorm.includes(qNorm) || qNorm.includes(tNorm);
      });
      if (preMatch) {
        const urlInfo = await ncm.getSongUrl(preMatch.id).catch(() => null);
        if (urlInfo?.url) tracks = [{ ...preMatch, url: urlInfo.url }];
      }
      if (!tracks.length) {
        try { tracks = await ncm.resolvePlaylist([query]); }
        catch (e) { console.error('[scheduler] resolve:', e.message); }
      }
      tracks = state.filterRepeats(tracks);
    }
    if (!tracks.length) {
      for (const t of preSearchTracks) {
        if (t.label === query || state.filterRepeats([t]).length === 0) continue;
        const urlInfo = await ncm.getSongUrl(t.id).catch(() => null);
        if (urlInfo?.url) { tracks = [{ ...t, url: urlInfo.url }]; break; }
      }
      if (!tracks.length) {
        const hard = await ncm.resolveHardFallback(HARD_FALLBACK_IDS);
        if (hard) tracks = [hard];
      }
      _schedulerFailStreak++;
    } else {
      _schedulerFailStreak = 0;
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
    console.log(`[scheduler] runTask DONE trigger=${trigger} tracks=${tracks.length} tts=${!!tts} fallback=${isFallback}`);
    return result;
  } catch (e) {
    console.error(`[scheduler] FAIL (${trigger}):`, e.message);
    return null;
  }
}

// Chat-only task: DJ speaks without changing music
async function runChatTask({ trigger, userInput, executionTrace }) {
  try {
    const s = state.getState();
    const { systemPrompt, userMessage } = await buildContext({
      userInput, state: s, executionTrace, intent: 'chat',
    });
    const result = await askDeepSeek(systemPrompt, userMessage);
    const speech = result.dj_speech || result.speech || result.monologue || result.say || '';
    state.addMessage('system', `[${trigger}]`);
    state.addMessage('assistant', speech, {});
    let tts = null;
    try {
      const p = await synthesize(speech);
      if (p) tts = 'data:audio/mp3;base64,' + require('fs').readFileSync(p).toString('base64');
    } catch {}
    broadcast({ type: 'scheduled', trigger, speech, action_type: 'chat_only', search_query: null, tracks: [], tts });
    return result;
  } catch (e) {
    console.error(`[scheduler] Chat FAIL:`, e.message);
    return null;
  }
}

let _proactiveInterval = null;
let _cronTasks = [];
let _lastStartup = Date.now();  // init to now so hourly cron is suppressed for 60s on cold boot

function start() {
  _cronTasks.push(cron.schedule('0 7 * * *', () => runTask({ trigger: 'daily', userInput: '早安播报', executionTrace: 'daily-7am' })));
  _cronTasks.push(cron.schedule('0 9 * * *', () => runTask({ trigger: 'morning', userInput: '上午音乐', executionTrace: 'morning-9am' })));
  _cronTasks.push(cron.schedule('0 7-23 * * *', () => {
    if (_schedulerFailStreak >= MAX_SCHEDULER_FAILS) return;
    // Suppress hourly if startup just fired (avoids double-song race at :00)
    if (Date.now() - _lastStartup < 60000) return;
    const h = new Date().getHours();
    const p = h < 10 ? '早上音乐检查' : h < 12 ? '上午氛围' : h < 14 ? '午餐放松' : h < 17 ? '午后提神' : h < 19 ? '傍晚切换' : '晚间舒缓';
    runTask({ trigger: 'hourly', userInput: p, executionTrace: 'hourly' });
  }));

  // ── DJ Proactive: 10-min idle → 20% chance, night silence 1-6am ──
  _proactiveInterval = setInterval(() => {
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

function stop() {
  if (_proactiveInterval) { clearInterval(_proactiveInterval); _proactiveInterval = null; }
  _cronTasks.forEach(t => { try { t.stop(); } catch {} });
  _cronTasks = [];
  console.log('[scheduler] Stopped');
}

async function triggerNow(trigger, userInput) {
  if (trigger === 'startup') _lastStartup = Date.now();
  return runTask({ trigger, userInput, executionTrace: trigger });
}

module.exports = { start, stop, setCallback, triggerNow };
