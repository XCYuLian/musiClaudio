/**
 * ROUTER.JS — Intent routing / dispatch (V2)
 */

const { buildContext } = require('./context');
const { askDeepSeek } = require('../api/deepseek');
const { synthesize } = require('../api/tts');
const ncm = require('../api/netease');
const state = require('./state');

const SLASH_CMDS = [
  { name: 'search',  pattern: /^\/search\s+(.+)/i },
  { name: 'skip',    pattern: /^\/(skip|next)/i },
  { name: 'playing', pattern: /^\/(now|playing|status)/i },
  { name: 'help',    pattern: /^\/(help|start)/i },
];

const MUSIC_RE = /^(播放|放首|搜一下?|点一首?|来一首?|放点|来点|我想听|给我放)\s*/;
const QUESTION_RE = /[？?]|什么|怎么|为什么|谁|哪|吗|呢|能不能|可以|是否/;

function classifyIntent(msg) {
  if (MUSIC_RE.test(msg)) return 'music';
  if (QUESTION_RE.test(msg)) return 'question';
  return 'chat';
}

async function route(message) {
  const m = (message || '').trim();
  if (!m) return { type: 'direct', data: { action: 'noop' } };

  for (const cmd of SLASH_CMDS) {
    const match = m.match(cmd.pattern);
    if (match) return handleCmd(cmd.name, match[1] || '');
  }

  const musicMatch = m.match(MUSIC_RE);
  if (musicMatch) {
    const q = m.slice(musicMatch[0].length).trim();
    if (q) return handleMusic(q);
  }

  const intent = classifyIntent(m);
  return handleChat(m, intent);
}

// ── Slash commands ──
function handleCmd(name, arg) {
  return { type: 'direct', data: { action: name, arg } };
}

// ── Music search shortcut ──
async function handleMusic(query) {
  let tracks = [];
  try { tracks = await ncm.search(query, 5); } catch {}
  const results = tracks.slice(0, 3).map((t, i) => `${i + 1}. ${t.label}`).join('\n');
  const s = state.getState();
  const { systemPrompt, userMessage } = await buildContext({
    userInput: `用户搜了: ${query}`,
    toolResult: `搜索结果:\n${results}`,
    state: s, executionTrace: 'music', intent: 'music',
  });
  const result = await askDeepSeek(systemPrompt, userMessage);
  const speech = result.dj_speech || result.speech || result.monologue || result.say || '';
  const searchQuery = result.search_query || query;
  // Resolve
  let resolved = [];
  try {
    resolved = await ncm.resolvePlaylist([searchQuery]);
    resolved = filterRepeats(resolved);
  } catch {}
  // TTS
  let tts = null;
  try { const p = await synthesize(speech); if (p) tts = 'data:audio/mp3;base64,' + require('fs').readFileSync(p).toString('base64'); } catch {}
  // Record
  state.addMessage('user', `music: ${query}`);
  state.addMessage('assistant', speech, {});
  if (resolved.length) resolved.forEach(t => state.addPlay(t.label || t.name, 'ai'));
  if (searchQuery) state.addPlay(searchQuery, 'ai-query');
  return { type: 'music', speech, action_type: 'change_song', search_query: searchQuery, tracks: resolved, tts };
}

// ── Chat pipeline ──
async function handleChat(input, intent = 'chat') {
  const s = state.getState();
  const { systemPrompt, userMessage } = await buildContext({
    userInput: input, state: s, executionTrace: 'chat', intent,
  });
  const result = await askDeepSeek(systemPrompt, userMessage);
  const speech = result.dj_speech || result.speech || result.monologue || result.say || '';
  const action = result.action_type || (result.play?.length ? 'change_song' : 'chat_only');
  const query = result.search_query || result.play?.[0] || null;
  // Resolve tracks
  let tracks = [];
  if (query && action !== 'chat_only') {
    try {
      tracks = await ncm.resolvePlaylist([query]);
      tracks = filterRepeats(tracks);
    } catch {}
  }
  // TTS
  let tts = null;
  try { const p = await synthesize(speech); if (p) tts = 'data:audio/mp3;base64,' + require('fs').readFileSync(p).toString('base64'); } catch {}
  // Record
  state.addMessage('user', input);
  state.addMessage('assistant', speech, {});
  if (tracks.length) tracks.forEach(t => state.addPlay(t.label || t.name, 'ai'));
  if (query) state.addPlay(query, 'ai-query');
  return { type: 'chat', speech, action_type: action, search_query: query, tracks, tts, intent };
}

function filterRepeats(tracks) {
  try {
    const recent = state.getRecentPlays(50);
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
    return tracks.filter(t => {
      const label = (t.label || t.name || '').toLowerCase().trim();
      const artist = (t.artists || '').toLowerCase().trim();
      if (recentTracks.has(label)) return false;
      if (artist && [...recentArtists].some(x => artist.includes(x) || x.includes(artist))) return false;
      return true;
    });
  } catch { return tracks; }
}

module.exports = { route };
