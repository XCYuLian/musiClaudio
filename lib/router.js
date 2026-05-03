/**
 * ROUTER.JS — Intent routing / dispatch
 *
 * Logic:
 *   - Simple commands (search, skip, play) → direct action + ncm lookup
 *   - Music search keywords             → Netease search → LLM DJ response
 *   - Natural language                  → context.js + claude.js (LLM)
 */

const { buildContext } = require('./context');
const { askDeepSeek } = require('./claude');
const ncm = require('./ncm');
const state = require('./state');

// ── Intent patterns ──
const INTENTS = [
  { name: 'search',    pattern: /^\/search\s+(.+)/i },
  { name: 'skip',      pattern: /^\/(skip|next)/i },
  { name: 'playing',   pattern: /^\/(now|playing|status)/i },
  { name: 'help',      pattern: /^\/(help|start)/i },
];

// ── Keywords that trigger direct Netease search ──
const MUSIC_QUERY_RE = /^(播放|放首|搜一下?|点一首?|来一首?|放点|来点)\s*/;

/**
 * Route an incoming message.
 *
 * @param {string} message
 * @returns {Promise<{
 *   type: 'direct' | 'llm' | 'search',
 *   say?: string, play?: Object[], reason?: string, segue?: string,
 *   tracks?: Object[], query?: string,
 *   data?: Object
 * }>}
 */
async function route(message) {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    return { type: 'direct', data: { action: 'noop' } };
  }

  // ── Step 1: slash commands ──
  for (const intent of INTENTS) {
    const match = trimmed.match(intent.pattern);
    if (match) {
      return handleCommand(intent.name, match[1] || '');
    }
  }

  // ── Step 2: music search shortcut → ncm search → LLM DJ wrap ──
  const musicMatch = trimmed.match(MUSIC_QUERY_RE);
  if (musicMatch) {
    const query = trimmed.slice(musicMatch[0].length).trim();
    if (query) {
      return handleMusicSearch(query);
    }
  }

  // ── Step 3: natural language → full LLM pipeline ──
  return handleLLM(trimmed);
}

// ── Command handlers ──

async function handleCommand(name, arg) {
  switch (name) {
    case 'search':
      return handleMusicSearch(arg);

    case 'skip':
      return {
        type: 'direct',
        data: { action: 'skip' },
        say: '好的，切到下一首。',
      };

    case 'playing':
      return {
        type: 'direct',
        data: { action: 'now_playing' },
      };

    case 'help':
      return {
        type: 'direct',
        data: { action: 'help' },
        say: '我是 Claudio，你的个人 AI 电台 DJ。你可以：\n'
          + '/search <关键词> — 搜索音乐\n'
          + '/skip — 跳过当前曲目\n'
          + '/now — 查看当前播放\n'
          + '或直接跟我聊天，说说你现在的感受。',
      };

    default:
      return { type: 'direct', data: { action: 'noop' } };
  }
}

// ── Music search: call ncm → feed results through LLM for DJ response ──

async function handleMusicSearch(query) {
  // 1. Search Netease
  let tracks = [];
  let ncmError = null;
  try {
    tracks = await ncm.search(query, 8);
  } catch (err) {
    ncmError = err.message;
  }

  // 2. If Netease is down, fall back to LLM-only
  if (ncmError || tracks.length === 0) {
    console.warn(`[router] Netease search failed for "${query}": ${ncmError || 'no results'}`);
    return handleLLM(`我想听 ${query}`);
  }

  // 3. Feed search results to LLM for a DJ-wrapped response
  const resultsText = tracks
    .slice(0, 5)
    .map((t, i) => `${i + 1}. ${t.label}`)
    .join('\n');

  const currentState = state.getState();
  const { systemPrompt, userMessage } = await buildContext({
    userInput: `搜索结果: ${query}`,
    toolResult: `以下为网易云搜索 "${query}" 的结果：\n${resultsText}\n\n请从中挑选最合适的歌曲，作为 DJ 播报。`,
    state: currentState,
    executionTrace: 'router-search',
  });

  const result = await askDeepSeek(systemPrompt, userMessage);

  // 4. Resolve the LLM-chosen tracks to playable URLs
  let resolvedTracks = [];
  if (result.play.length) {
    try {
      resolvedTracks = await ncm.resolvePlaylist(result.play);
    } catch (err) {
      console.error('[router] Track resolution failed:', err.message);
    }
  }

  // Persist
  state.addMessage('user', `search: ${query}`);
  state.addMessage('assistant', result.say, { play: result.play, reason: result.reason });

  return {
    type: 'search',
    say: result.say,
    play: result.play,
    reason: result.reason,
    segue: result.segue,
    tracks: resolvedTracks,
    query,
    _meta: result._meta,
  };
}

// ── Full LLM path ──

async function handleLLM(userInput) {
  const currentState = state.getState();

  const { systemPrompt, userMessage } = await buildContext({
    userInput,
    state: currentState,
    executionTrace: 'router-llm',
  });

  const result = await askDeepSeek(systemPrompt, userMessage);

  // Resolve tracks to playable URLs
  let tracks = [];
  if (result.play.length) {
    try {
      tracks = await ncm.resolvePlaylist(result.play);
    } catch (err) {
      console.error('[router] Track resolution failed:', err.message);
    }
  }

  // Persist
  state.addMessage('user', userInput);
  state.addMessage('assistant', result.say, {
    play: result.play,
    reason: result.reason,
    segue: result.segue,
  });

  return {
    type: 'llm',
    data: { systemPrompt, userMessage },
    ...result,
    tracks,
  };
}

module.exports = { route, handleCommand, handleLLM };
