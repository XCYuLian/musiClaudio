/**
 * SCHEDULER.JS — Cron + auto-start (CLEAN V2)
 */

const cron = require('node-cron');
const { buildContext } = require('./context');
const { askDeepSeek } = require('./claude');
const { synthesize } = require('./tts');
const ncm = require('./ncm');
const state = require('./state');

let onTask = null;

function setCallback(fn) { onTask = fn; }
function broadcast(data) { if (onTask) onTask(data); }

async function runTask({ trigger, userInput, executionTrace }) {
  try {
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
        if (!tracks.length) console.log('[scheduler] No tracks after filter');
      } catch (e) { console.error('[scheduler] resolve:', e.message); }
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
  const BLOCKED = ['bonobo','toe','uyama hiroto','nujabes','dj okawari'];
  try {
    const recent = state.getRecentPlays(50);
    const artists = new Set(recent.map(p => {
      const d = p.track.indexOf(' - ');
      return d > 0 ? p.track.slice(0, d).toLowerCase().trim() : '';
    }).filter(Boolean));
    BLOCKED.forEach(a => artists.add(a));
    return tracks.filter(t => {
      const a = (t.artists || t.label || '').toLowerCase().trim();
      return ![...artists].some(x => a.includes(x) || x.includes(a));
    });
  } catch { return tracks; }
}

function start() {
  cron.schedule('0 7 * * *', () => runTask({ trigger: 'daily', userInput: '早安播报', executionTrace: 'daily-7am' }));
  cron.schedule('0 9 * * *', () => runTask({ trigger: 'morning', userInput: '上午音乐', executionTrace: 'morning-9am' }));
  cron.schedule('0 7-23 * * *', () => {
    const h = new Date().getHours();
    const p = h < 10 ? '早上音乐检查' : h < 12 ? '上午氛围' : h < 14 ? '午餐放松' : h < 17 ? '午后提神' : h < 19 ? '傍晚切换' : '晚间舒缓';
    runTask({ trigger: 'hourly', userInput: p, executionTrace: 'hourly' });
  });
  console.log('[scheduler] Started');
}

function stop() { console.log('[scheduler] Stopped'); }

async function triggerNow(trigger, userInput) {
  return runTask({ trigger, userInput, executionTrace: trigger });
}

module.exports = { start, stop, setCallback, triggerNow };
