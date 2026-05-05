const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { getWeather } = require('../api/weather');

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
    getLikedSongsHint(),

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
    '## EXPLORATION BIAS (randomized each request — avoid repetition)',
    `${getExplorationBias()}`,
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
// Exploration bias — random niche genre injection (Plan 3: diversity)
// ---------------------------------------------------------------------------
const NICHE_GENRES = [
  'Lo-fi Hip Hop', 'Vaporwave', 'City Pop', '采样艺术/Sample-based',
  'Shoegaze', 'Dream Pop', 'Post-Rock 后摇', 'Neo-Soul',
  'Trip-Hop', 'Ambient Techno', 'Jazz Fusion', 'Bossa Nova',
  'Chillwave', 'Synthwave', 'Indie Folk', 'Math Rock',
  'Afrobeat', 'Latin Jazz', 'Funk/Soul', 'Psychedelic Rock',
];
const EXPLORATION_TIPS = [
  '尝试推荐一些小众独立音乐人的作品，避开主流榜单。',
  '今天适合探索 80-90 年代的华语遗珠。',
  '挖掘一些韩国 R&B 或日本 City Pop。',
  '推荐几首器乐/纯音乐作品，歌词不是必须的。',
  '可以推荐一些采样老歌的现代改编版。',
  '今天偏向氛围感强的音乐，不一定要有歌词。',
  '尝试推一些不同语言的音乐（法语、西语、韩语）。',
];

function getExplorationBias() {
  const genre = NICHE_GENRES[Math.floor(Math.random() * NICHE_GENRES.length)];
  const tip = EXPLORATION_TIPS[Math.floor(Math.random() * EXPLORATION_TIPS.length)];
  const weather = getWeatherHint();
  return [
    `🎯 今日探索方向: ${genre}`,
    `💡 ${tip}`,
    weather ? `🌤 ${weather}` : '',
  ].filter(Boolean).join('\n');
}

function getWeatherHint() {
  const h = new Date().getHours();
  const m = new Date().getMonth() + 1;
  const d = new Date().getDate();
  // Zodiac sign approximation
  const zodiac = getZodiac(m, d);
  if (h < 6) return `凌晨 ${h} 点，适合极度冷静的 Ambient 或 Lo-fi。${zodiac}`;
  if (h < 9) return `清晨 ${h} 点，适合温柔唤醒的 Acoustic 或 Bossa Nova。${zodiac}`;
  if (h < 12) return `上午工作时段，推荐专注友好的 Post-Rock 或器乐。${zodiac}`;
  if (h < 14) return `午餐时间，来点轻松的 Jazz 或 City Pop。${zodiac}`;
  if (h < 17) return `下午提神，适合 Funk、Neo-Soul 或 Afrobeat。${zodiac}`;
  if (h < 19) return `傍晚放松，推荐 Dream Pop 或 Chillwave。${zodiac}`;
  if (h < 22) return `夜晚氛围，来点 Trip-Hop 或 Ambient Techno。${zodiac}`;
  return `深夜 ${h} 点，适合极简 Ambient 或 Lo-fi。${zodiac}`;
}

function getZodiac(month, day) {
  const signs = ['摩羯座','水瓶座','双鱼座','白羊座','金牛座','双子座','巨蟹座','狮子座','处女座','天秤座','天蝎座','射手座'];
  const cuts = [20,19,21,20,21,22,23,23,23,24,23,22];
  let idx = month - 1;
  if (day < cuts[idx]) idx = (idx + 11) % 12;
  return `今日星座运势参考: ${signs[idx]}`;
}

function getLikedSongsHint() {
  try {
    const state = require('./state');
    const liked = state.getPref('liked_songs_sample') || '';
    if (!liked) return '';
    return `### 🎧 网易云心动歌曲 (Reference Anchors)\n你最近收藏了这些歌，说明你偏爱这类风格。请找风格相似但**不同的新声音**，不要重复推荐这些歌：\n${liked}`;
  } catch { return ''; }
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
