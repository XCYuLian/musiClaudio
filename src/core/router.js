/**
 * ROUTER.JS — Intent routing / dispatch (V2)
 */

const { buildContext } = require('./context');
const { askDeepSeek } = require('../api/deepseek');
const { synthesize } = require('../api/tts');
const ncm = require('../api/netease');
const state = require('./state');
const { HARD_FALLBACK_IDS } = require('./config');

const FALLBACK_QUERIES = [
  'Jazz piano trio', 'Bossa Nova guitar', 'Post-rock instrumental',
  '华语民谣 吉他', 'R&B 律动', 'Lo-fi study beat',
  'Funk groove', 'Acoustic indie', 'City Pop',
];

const SLASH_CMDS = [
  { name: 'search',  pattern: /^\/search\s+(.+)/i },
  { name: 'skip',    pattern: /^\/(skip|next)/i },
  { name: 'playing', pattern: /^\/(now|playing|status)/i },
  { name: 'help',    pattern: /^\/(help|start)/i },
  { name: 'story',   pattern: /^\/story/i },
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
    if (match) { console.log(`[router] slash cmd: ${cmd.name}`); return handleCmd(cmd.name, match[1] || ''); }
  }

  const musicMatch = m.match(MUSIC_RE);
  if (musicMatch) {
    const q = m.slice(musicMatch[0].length).trim();
    if (q) { console.log(`[router] music direct: "${q}"`); return handleMusic(q); }
  }

  const intent = classifyIntent(m);
  console.log(`[router] intent=${intent} msg="${m.slice(0,50)}..."`);
  return handleChat(m, intent);
}

// ── Slash commands ──
function handleCmd(name, arg) {
  return { type: 'direct', data: { action: name, arg } };
}

// ── Music search shortcut ──
async function handleMusic(query) {
  console.log(`[router] handleMusic query="${query}"`);
  let tracks = [];
  try { tracks = await ncm.search(query, 5); console.log(`[router] handleMusic search: ${tracks.length} results`); } catch (e) { console.warn(`[router] handleMusic search FAIL: ${e.message}`); }
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
    resolved = state.filterRepeats(resolved);
  } catch {}
  if (!resolved.length && searchQuery) {
    try {
      const fb = await ncm.search(FALLBACK_QUERIES[Math.floor(Math.random() * FALLBACK_QUERIES.length)], 3);
      if (fb.length) {
        const urlInfo = await ncm.getSongUrl(fb[0].id).catch(() => null);
        if (urlInfo?.url) resolved = [{ ...fb[0], url: urlInfo.url }];
      }
    } catch {}
  }
  // TTS
  let tts = null;
  try { const p = await synthesize(speech); if (p) tts = 'data:audio/mp3;base64,' + require('fs').readFileSync(p).toString('base64'); } catch {}
  // Record
  state.addMessage('user', `music: ${query}`);
  state.addMessage('assistant', speech, {});
  if (resolved.length) resolved.forEach(t => state.addPlay(t.label || t.name, 'ai'));
  if (searchQuery) state.addPlay(searchQuery, 'ai-query');
  return { type: 'music', speech, action_type: 'change_song', search_query: searchQuery, tracks: resolved, tts, _meta: result._meta };
}

// ── Chat pipeline ──
async function handleChat(input, intent = 'chat') {
  console.log(`[router] handleChat intent=${intent} input="${input.slice(0,50)}..."`);
  // Pre-search only for explicit auto-refill, not every chat cycle
  let preSearchResults = '';
  if (intent === 'auto') {
    try {
      const tags = ['City Pop','Neo-Soul','Jazz Fusion','Dream Pop','Trip-Hop'];
      const t = tags[Math.floor(Math.random()*tags.length)];
      const results = await ncm.search(t, 6);
      preSearchResults = results.map((t,i) => `${i+1}. ${t.label}`).join('\n');
    } catch {}
  }
  const s = state.getState();
  const { systemPrompt, userMessage } = await buildContext({
    userInput: input, state: s, executionTrace: 'chat', intent, preSearchResults,
  });
  const result = await askDeepSeek(systemPrompt, userMessage);
  const speech = result.dj_speech || result.speech || result.monologue || result.say || '';
  const action = result.action_type || (result.play?.length ? 'change_song' : 'chat_only');
  const query = result.search_query || result.play?.[0] || null;
  const isFallback = !!result._meta?.fallback;
  console.log(`[router] handleChat AI: action=${action} fallback=${isFallback} query="${query||''}" tts=${!!speech}`);

  // Fast path: AI fallback → skip TTS, use hard fallback track directly
  if (isFallback && action !== 'chat_only') {
    console.log('[router] handleChat → hard fallback path');
    const hard = await ncm.resolveHardFallback(HARD_FALLBACK_IDS);
    if (hard) {
      console.log(`[router] hard fallback OK: "${hard.label}"`);
      state.addMessage('user', input);
      state.addMessage('assistant', speech, {});
      state.addPlay(hard.label || hard.name, 'ai');
      return { type: 'chat', speech: 'AI 暂时休息，为你播首经典。', action_type: 'change_song',
        search_query: hard.label, tracks: [hard], tts: null, intent, _meta: result._meta };
    }
    console.warn('[router] hard fallback ALL FAILED');
  }

  // Resolve tracks
  let tracks = [];
  if (query && action !== 'chat_only') {
    try {
      tracks = await ncm.resolvePlaylist([query]);
      tracks = state.filterRepeats(tracks);
      console.log(`[router] resolvePlaylist: ${tracks.length} tracks after filter`);
    } catch (e) { console.warn(`[router] resolvePlaylist FAIL: ${e.message}`); }
    // If filter blocked everything, go hard fallback instead of refill loop
    if (!tracks.length && query) {
      try {
        const fb = await ncm.search(FALLBACK_QUERIES[Math.floor(Math.random() * FALLBACK_QUERIES.length)], 3);
        if (fb.length) {
          const urlInfo = await ncm.getSongUrl(fb[0].id).catch(() => null);
          if (urlInfo?.url) { tracks = [{ ...fb[0], url: urlInfo.url }]; console.log(`[router] fallback: "${fb[0].label}"`); }
        }
      } catch {}
    }
  }
  // TTS — skip for fallback speech to avoid timeout delay
  let tts = null;
  if (!isFallback) {
    try { const p = await synthesize(speech); if (p) tts = 'data:audio/mp3;base64,' + require('fs').readFileSync(p).toString('base64'); } catch (e) { console.warn(`[router] TTS FAIL: ${e.message}`); }
  } else { console.log('[router] TTS skipped (fallback)'); }
  // Record
  state.addMessage('user', input);
  state.addMessage('assistant', speech, {});
  if (tracks.length) tracks.forEach(t => state.addPlay(t.label || t.name, 'ai'));
  if (query) state.addPlay(query, 'ai-query');
  console.log(`[router] handleChat DONE: ${tracks.length} tracks tts=${!!tts}`);
  return { type: 'chat', speech, action_type: action, search_query: query, tracks, tts, intent, _meta: result._meta };
}

module.exports = { route };
