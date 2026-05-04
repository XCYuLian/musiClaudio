const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { getWeather } = require('./weather');

const paths = require('./paths');
const USER_DIR = paths.USER_DIR;
const PROMPTS_DIR = paths.PROMPTS_DIR;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadMarkdown(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return ''; // missing file = silent no-op
  }
}

function loadJSON(filePath) {
  try {
    return JSON.parse(fsSync.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Context builder — assembles the 6-block context window per the architecture
// ---------------------------------------------------------------------------

/**
 * @param {Object} opts
 * @param {string} [opts.userInput]       - 用户输入
 * @param {string} [opts.toolResult]      - 网易云检索结果
 * @param {string} [opts.executionTrace]  - scheduler / webhook 来源
 * @param {string} [opts.intent]          - 'question' | 'chat' | 'music' | 'auto'
 * @param {Object} [opts.state]           - state.db 中取出的记忆
 * @param {Object} [opts.env]             - 环境注入覆盖 (weather, calendar)
 * @returns {Promise<{systemPrompt: string, userMessage: string}>}
 */
async function buildContext(opts = {}) {
  const {
    userInput = '',
    toolResult = '',
    executionTrace = '',
    intent = 'chat',
    state = null,
    env = {},
  } = opts;

  // ── Block 1: System Persona ──
  const persona = await loadMarkdown(path.join(PROMPTS_DIR, 'dj-persona.md'));

  // ── Block 0: Soul DNA (MANDATORY — loaded from profiler output) ──
  const dna = await loadMarkdown(path.join(paths.DATA, 'internal_taste_dna.md'));

  // ── Block 2: User Corpus ──
  const taste = await loadMarkdown(path.join(USER_DIR, 'taste.md'));
  const routines = await loadMarkdown(path.join(USER_DIR, 'routines.md'));
  const moodRules = await loadMarkdown(path.join(USER_DIR, 'mood-rules.md'));
  // Load playlist summary (sample, not full 1000 — too large for context)
  let playlistSample = [];
  try {
    const raw = loadJSON(paths.PLAYLIST_FILE);
    if (Array.isArray(raw)) playlistSample = raw.slice(0, 200); // first 200 as sample
    else if (raw?.liked_songs) playlistSample = raw.liked_songs.slice(0, 200);
    else playlistSample = Object.values(raw).flat().slice(0, 200);
  } catch { playlistSample = ['(no playlist loaded)']; }

  // ── Block 3: Environment Injection ──
  let weatherText = env.weather || 'unavailable';
  if (!env.weather) {
    try { weatherText = await getWeather(); } catch { /* keep 'unavailable' */ }
  }

  const envBlock = [
    `Weather: ${weatherText}`,
    env.calendar ? `Calendar: ${env.calendar}` : 'Calendar: no upcoming events',
  ].join('\n');

  // ── Block 4: Retrieved Memory ──
  let memoryBlock = 'No prior state';
  if (state) {
    const parts = [];
    if (state.plays?.length)
      parts.push(`BLACKLIST — These were recently played. You are FORBIDDEN from recommending these artists again today: ${state.plays.slice(-10).map(p => p.track).join(' | ')}`);
    if (state.plan)
      parts.push(`Today's plan: ${state.plan}`);
    if (state.prefs)
      parts.push(`Preferences: ${JSON.stringify(state.prefs)}`);
    if (parts.length) memoryBlock = parts.join('\n');
  }

  // ── Block 5: User Input / Tool Result ──
  const inputBlock = userInput || toolResult || '(idle — spontaneous DJ check)';

  // ── Block 6: Execution Trace ──
  const traceBlock = executionTrace || 'manual-chat';

  // ── Assemble System Prompt ──
  // Build prominent current_time stamp — injected at prompt HEAD
  const now = new Date();
  const currentTimeBlock = [
    `current_time: ${now.toISOString()}`,
    `weekday: ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()]}`,
    `time_of_day: ${getTimeOfDay(now.getHours())}`,
    `timestamp_ms: ${now.getTime()}`,
  ].join('\n');

  const systemPrompt = [
    `## CURRENT TIME (authoritative — do NOT guess or override)\n${currentTimeBlock}`,

    (dna
      ? `${dna}\n\n---\n## IDENTITY LOCK\nYou KNOW the user's taste via the DNA above. Their playlist tracks are OFF-LIMITS for recommendations — find NEW songs matching their taste profile. NEVER recommend songs already in their playlist unless explicitly asked.`
      : '## IDENTITY LOCK\nNo DNA profile loaded yet. Ask the user to import their playlist. DO NOT pretend to know their taste — be honest that no data is available.'
    ),

    '---',
    '## MEMORY (READ FIRST — these are BLACKLISTED)',
    memoryBlock,

    '---',
    persona,

    '---',
    '## USER PROFILE',
    `### Taste\n${taste}`,
    `### Routines\n${routines}`,
    `### Mood Rules\n${moodRules}`,
    `### Your Playlist (sample showing genre variety — DO NOT recommend these)\n\`\`\`\n${playlistSample.filter((_,i)=>i%4===0).slice(0,50).join('\n')}\n\`\`\`\n(Total: ${playlistSample.length}+ tracks. Half are Chinese/Asian artists. These are OFF-LIMITS.)`,

    '---',
    '## ENVIRONMENT',
    envBlock,

    '---',
    '## EXECUTION CONTEXT',
    `Source: ${traceBlock}`,

    '---',
    `## INTENT: ${intent}`,
    (intent === 'question'
      ? 'User is asking a question. action_type="chat_only", search_query=null. Just answer in dj_speech. DO NOT recommend music.'
      : intent === 'chat'
      ? 'User is chatting/sharing casually. action_type="chat_only", search_query=null. Just respond warmly. DO NOT change music.'
      : intent === 'music'
      ? 'User explicitly wants music. action_type="change_song", search_query="Artist SongName".'
      : intent === 'auto'
      ? 'Auto-broadcast. action_type="change_song", search_query="Artist SongName".'
      : 'action_type="chat_only", search_query=null.'),
    '',
    '---',
    '## OUTPUT REQUIREMENT — READ CAREFULLY',
    'You MUST output a SINGLE valid JSON object. No markdown. No extra text.',
    '',
    'REQUIRED SCHEMA:',
    '{',
    '  "system_log": "string — internal status (shown dim, NOT spoken). Empty string ok.",',
    '  "dj_speech": "string — what the DJ SAYS aloud. TTS will read this. ≤80 Chinese chars.",',
    '  "action_type": "chat_only" | "change_song",',
    '  "search_query": "string — Artist SongName. REQUIRED for change_song. null for chat_only."',
    '}',
    '',
    'RULES:',
    '- User chatting/sharing mood → action_type="chat_only", search_query=null. DO NOT change music.',
    '- User asks for music / change song → action_type="change_song", search_query="Artist SongName".',
    '- Auto-recommend next track → action_type="change_song", search_query="Artist SongName".',
    '- dj_speech ≤80 Chinese chars, warm DJ tone.',
    '',
    'Respond ONLY with the JSON object. No markdown. No other output.',
    '',
    'CRITICAL: Use the CURRENT TIME block above as the authoritative time reference.',
    '',
    '## DISCOVERY + DIVERSITY RULES',
    '- 90% of recs: songs NOT in the playlist. 10% max: comfort picks.',
    '- 50% MUST be Chinese/Asian music (华语/粤语/日韩). Alternate languages.',
    '- NEVER repeat same song or artist twice in a row.',
    '- Vary genres AND languages each time.',
    'For new tracks: "为你挖掘了一首宝藏"。For familiar: "这首来自你的歌单"。',
    '',
    'Respond ONLY with the JSON object. No other output.',
  ].filter(b => b !== '').join('\n');

  // ── Assemble User Message ──
  let userMessage = inputBlock;
  if (toolResult) {
    userMessage = `Netease search results:\n${toolResult}\n\n---\nBased on the above results, compose your DJ response.`;
  }

  return { systemPrompt, userMessage };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeOfDay(h) {
  if (h < 6)  return 'late-night';
  if (h < 9)  return 'early-morning';
  if (h < 12) return 'morning';
  if (h < 14) return 'lunch';
  if (h < 17) return 'afternoon';
  if (h < 19) return 'evening';
  if (h < 22) return 'night';
  return 'late-night';
}

// ---------------------------------------------------------------------------
module.exports = { buildContext };
