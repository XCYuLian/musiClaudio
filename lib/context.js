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
  // Load from new data path first, fall back to old
  let playlists = loadJSON(paths.PLAYLIST_FILE);
  if (!Object.keys(playlists).length) playlists = loadJSON(path.join(USER_DIR, 'playlists.json'));
  if (Array.isArray(playlists)) playlists = { 'liked_songs': playlists };

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
      parts.push(`Recent plays: ${state.plays.slice(-10).map(p => p.track).join(' → ')}`);
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
      ? `${dna}\n\n---\n## IDENTITY LOCK\nYou have FULL access to the user's playlist data shown above in <MANDATORY_USER_DNA>. You KNOW their taste. NEVER say "I haven't seen your playlist" or "I don't know your preferences" — the DNA above IS their preference profile. Base ALL music choices on this DNA.`
      : '## IDENTITY LOCK\nNo DNA profile loaded yet. Ask the user to import their playlist. DO NOT pretend to know their taste — be honest that no data is available.'
    ),

    '---',
    persona,

    '---',
    '## USER PROFILE',
    `### Taste\n${taste}`,
    `### Routines\n${routines}`,
    `### Mood Rules\n${moodRules}`,
    `### Playlists\n\`\`\`json\n${JSON.stringify(playlists, null, 2)}\n\`\`\``,

    '---',
    '## ENVIRONMENT',
    envBlock,

    '---',
    '## MEMORY',
    memoryBlock,

    '---',
    '## EXECUTION CONTEXT',
    `Source: ${traceBlock}`,

    '---',
    `## INTENT: ${intent}`,
    (intent === 'question'
      ? 'The user is ASKING A QUESTION. You MUST answer it directly in `reply` first. Keep `monologue` brief or skip it. `play` can be empty.'
      : intent === 'music'
      ? 'The user wants MUSIC. Prioritize `play` and `monologue`. `reply` can be empty.'
      : intent === 'auto'
      ? 'Auto-broadcast mode. No user question — focus on `monologue` and `play`. `reply` must be empty.'
      : 'Casual chat. Light `monologue`, optional `play`. `reply` for any direct response.'),
    '',
    '---',
    '## OUTPUT REQUIREMENT — READ CAREFULLY',
    'You MUST output a SINGLE valid JSON object on one line. No markdown fences. No surrounding text.',
    '',
    'REQUIRED SCHEMA:',
    '{',
    '  "reply": "string — DIRECT answer to user question. Empty "" if no question asked.",',
    '  "monologue": "string — DJ broadcast in Chinese, 2-4 sentences. Can be empty if user just asked a question.",',
    '  "play": ["string — Netease search query 1", ...],',
    '  "reason": "string — why you chose these tracks AND the rhythm/pacing logic",',
    '  "segue": "string — transition between tracks"',
    '}',
    '',
    'CONSTRAINTS:',
    '- If user asked a question → `reply` MUST answer it. Do NOT ignore questions.',
    '- `monologue` in Chinese, warm and personal. May be empty for question-only responses.',
    '- `play` MUST contain 3-5 search queries in format "Artist - SongName" (e.g. "张震岳 - 路口"). Artist name is REQUIRED — never search by song name alone. Exceptions: question-only mode may have 0-2.',
    '- `reason` MUST explain: (1) why you chose each track, AND (2) the overall rhythm/pacing arc (e.g. "start energetic → middle groove → cool-down").',
    '- `segue` should bridge context into the first track.',
    '',
    'CRITICAL: Use the CURRENT TIME block above as the authoritative time reference. Do NOT guess or invent time values.',
    '',
    '## PLAYLIST MATCH RULE',
    'The user has an imported playlist. When you recommend tracks in `play`, check if any track matches their playlist.',
    'If a recommended song IS in their playlist, mention it naturally in `monologue`: e.g. "这首歌就在你的歌单里，看来我们品味一致"。',
    'If NOT in their playlist, say "为你推荐一首新歌" or similar.',
    'This makes the user feel heard — their playlist data IS available to you.',
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
