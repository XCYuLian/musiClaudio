const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { getWeather } = require('./weather');

const USER_DIR = path.resolve(__dirname, '..', 'user');
const PROMPTS_DIR = path.resolve(__dirname, '..', 'prompts');

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
 * @param {string} [opts.userInput]       - 用户输入 /api/chat
 * @param {string} [opts.toolResult]      - 网易云检索结果
 * @param {string} [opts.executionTrace]  - scheduler / webhook 来源
 * @param {Object} [opts.state]           - state.db 中取出的记忆
 * @param {Object} [opts.env]             - 环境注入覆盖 (weather, calendar)
 * @returns {Promise<{systemPrompt: string, userMessage: string}>}
 */
async function buildContext(opts = {}) {
  const {
    userInput = '',
    toolResult = '',
    executionTrace = '',
    state = null,
    env = {},
  } = opts;

  // ── Block 1: System Persona ──
  const persona = await loadMarkdown(path.join(PROMPTS_DIR, 'dj-persona.md'));

  // ── Block 2: User Corpus ──
  const taste = await loadMarkdown(path.join(USER_DIR, 'taste.md'));
  const routines = await loadMarkdown(path.join(USER_DIR, 'routines.md'));
  const moodRules = await loadMarkdown(path.join(USER_DIR, 'mood-rules.md'));
  const playlists = loadJSON(path.join(USER_DIR, 'playlists.json'));

  // ── Block 3: Environment Injection ──
  const now = new Date();
  const nowISO = now.toISOString();
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()];
  const timeOfDay = getTimeOfDay(now.getHours());

  let weatherText = env.weather || 'unavailable';
  if (!env.weather) {
    try { weatherText = await getWeather(); } catch { /* keep 'unavailable' */ }
  }

  const envBlock = [
    `Current time: ${nowISO} (${weekday}, ${timeOfDay})`,
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
  const systemPrompt = [
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
    '## OUTPUT REQUIREMENT — READ CAREFULLY',
    'You MUST output a SINGLE valid JSON object on one line. No markdown fences. No "Here is your JSON". No surrounding text of any kind.',
    '',
    'REQUIRED SCHEMA:',
    '{',
    '  "say": "string — DJ announcement in Chinese, 2-4 sentences",',
    '  "play": ["string — Netease search query 1", "string — query 2", ...],',
    '  "reason": "string — why you chose these tracks",',
    '  "segue": "string — transition phrase between tracks"',
    '}',
    '',
    'CONSTRAINTS:',
    '- "say" must be in Chinese, warm and personal.',
    '- "play" must be 1-5 specific search queries (artist + track when possible).',
    '- "reason" must genuinely reference the user\'s taste / routine / mood.',
    '- "segue" should bridge the current context into the first track.',
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
