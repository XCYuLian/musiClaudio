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
    preSearchResults = '',  // pre-searched Netease results → AI picks from real songs
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
  // Load playlist — extract artists as exploration pool + sample for context
  let playlistSample = [];
  let playlistArtists = [];
  try {
    const raw = loadJSON(paths.PLAYLIST_FILE);
    if (Array.isArray(raw)) playlistSample = raw.slice(0, 200);
    else if (raw?.liked_songs) playlistSample = raw.liked_songs.slice(0, 200);
    else playlistSample = Object.values(raw).flat().slice(0, 200);
    // Extract unique artists from full playlist as exploration pool
    const artistSet = new Set();
    (Array.isArray(raw) ? raw : []).forEach(entry => {
      const dash = (entry || '').indexOf(' - ');
      if (dash > 0) artistSet.add(entry.slice(0, dash).trim());
    });
    playlistArtists = [...artistSet];
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
    if (state.plays?.length) {
      const blacklistTracks = state.plays.slice(-30).map(p => p.track).join(' | ');
      parts.push(`⏳ Recently played (avoid these for now — they'll be available again tomorrow):\n${blacklistTracks}`);
      console.log('[context] BLACKLIST sent to AI:', blacklistTracks.substring(0, 200));
    }
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
      ? `${dna}\n\n---\n## IDENTITY LOCK\nDNA above is your taste compass. It tells you WHAT GENRES to explore, not WHO to play. You must discover specific artists yourself. The ⏳ recently-played list tells you who to temporarily avoid.`
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
    '  "dj_speech": "string — DJ开场口播。60-120字，2-3句话。包含情绪场景+歌曲风格+聆听建议。TTS会读出来。",',
    '  "action_type": "chat_only" | "change_song",',
    '  "search_query": "string — Artist SongName. REQUIRED for change_song. null for chat_only."',
    '}',
    '',
    'RULES:',
    '- User chatting/sharing mood → action_type="chat_only", search_query=null. DO NOT change music.',
    '- User asks for music / change song → action_type="change_song", search_query="Artist SongName".',
    '- Auto-recommend next track → action_type="change_song", search_query="Artist SongName".',
    '- dj_speech: 60-120字，2-3句话。切入场景+介绍风格+聆听建议。像深夜朋友聊天。',
    '',
    'Respond ONLY with the JSON object. No markdown. No other output.',
    '',
    'CRITICAL: Use the CURRENT TIME block above as the authoritative time reference.',
    '',
    '## EXPLORATION BIAS (randomized each request — avoid repetition)',
    `${getExplorationBias(playlistArtists)}`,
    '',
    (preSearchResults
      ? `## 🎵 网易云可播曲目（已搜索验证，真实存在，从中挑选一首）\n\`\`\`\n${preSearchResults}\n\`\`\`\n⚠️ 你必须从上面的列表里挑一首，把它的'歌手 歌名'原样复制为 search_query。例如列表里有'大貫妙子 - 都会'，就输出 search_query:'大貫妙子 都会'。绝对不要自己编歌名。`
      : ''
    ),
    '## DISCOVERY + DIVERSITY RULES',
    '- 70% fresh discoveries (new artists, new genres) + 30% familiar favorites (only if NOT in recently-played list).',
    '- 50% MUST be Chinese/Asian music (华语/粤语/日韩). Alternate languages.',
    '- Avoid the ⏳ recently-played list — those will be available again tomorrow.',
    '- Vary genres AND languages each time.',
    'For new discoveries: "为你挖掘了一首宝藏"。For familiar: "好久没听这首了"。',
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
// Artist map: give AI concrete names to explore, not just abstract genres
const GENRE_ARTIST_MAP = {
  'Lo-fi Hip Hop': 'Nujabes, J Dilla, DJ Okawari, 丁世光, 国蛋, 李权哲, 9m88, C-Block',
  'Vaporwave': '2814, 猫 シ Corp, Yung Bae, Night Tempo, 银河骑士, 传琦SAMA, 李老板, 音速行星',
  'City Pop': 'Mariya Takeuchi, Tatsuro Yamashita, Anri, 大貫妙子, 杏里, 当山瞳, 具岛直子, 竹内美宥',
  '采样艺术': 'The Avalanches, DJ Shadow, Madlib, Knxwledge, 小老虎, 也是福, Itsogoo, 精气神',
  'Shoegaze': 'My Bloody Valentine, Slowdive, Alcest, 缺省Default, 卧轨的火车, 晕盖Gatsby, 沉默演讲, 荒诞斯坦',
  'Dream Pop': 'Beach House, Cigarettes After Sex, Alvvays, 动物园钉子户, 结冰水, 和平和浪, 浪味仙贝, 表情银行',
  'Post-Rock 后摇': 'Sigur Rós, Mogwai, MONO, 惘闻, 沼泽, 文雀, 琥珀, 时过夏末, 甜梅号, 穿越稜镜',
  'Neo-Soul': 'Erykah Badu, D\'Angelo, Anderson .Paak, 丁世光, 余佳运, 吕彦良, 地磁卡, 阿克江Akin, 陶喆, 方大同',
  'Trip-Hop': 'Massive Attack, Portishead, Tricky, Morcheeba, 超级市场, 龙宽九段, 星期三旅行, 虎子',
  'Ambient Techno': 'Aphex Twin, Boards of Canada, Susumu Yokota, 白水, FM3, 窦唯(暮良文王), 王凡, 林强',
  'Jazz Fusion': 'Casiopea, T-Square, Masayoshi Takanaka, Hiromi, 顾忠山, 秦四风, J3 Trio, 红节奏, TTechmak',
  'Bossa Nova': 'Antonio Carlos Jobim, João Gilberto, Lisa Ono, 小野丽莎, 王若琳, 彭靖惠, 叶树茵, Joanna Wang',
  'Chillwave': 'Washed Out, Toro Y Moi, Neon Indian, 香料SPICE, 卧轨的火车, 白纸扇, 海朋森',
  'Synthwave': 'Kavinsky, The Midnight, FM-84, 音速行星, 白鲸乐队, 新裤子, 大波浪, 重塑雕像的权利',
  'Indie Folk': 'Bon Iver, Sufjan Stevens, Iron & Wine, 万能青年旅店, 五条人, 陈鸿宇, 尧十三, 宋冬野, 张玮玮',
  'Math Rock': 'toe, Tricot, American Football, CHON, 大象体操, LITE, 国足, 话梅鹿, 鬼否, Fayzz',
  'Afrobeat': 'Fela Kuti, Burna Boy, Wizkid, Antibalas, Tony Allen, Seun Kuti, Ebo Taylor',
  'Latin Jazz': 'Irakere, Buena Vista Social Club, Tito Puente, Cal Tjader, Ray Barretto, Mongo Santamaria',
  'Funk/Soul': 'Stevie Wonder, Vulfpeck, Khruangbin, 方大同, 李荣浩, 9m88, 问题总部, 橘子海, 马念先',
  'Psychedelic Rock': 'Tame Impala, King Gizzard, Khruangbin, 晕盖Gatsby, 鸟撞Birdstriking, 疯医, 海朋森, 脏手指',
};
const EXPLORATION_TIPS = [
  '尝试推荐一些小众独立音乐人的作品，避开主流榜单。',
  '今天适合探索 80-90 年代的华语遗珠。',
  '挖掘一些韩国 R&B 或日本 City Pop。',
  '推荐几首器乐/纯音乐作品，歌词不是必须的。',
  '可以推荐一些采样老歌的现代改编版。',
  '今天偏向氛围感强的音乐，不一定要有歌词。',
  '尝试推一些不同语言的音乐（法语、西语、韩语）。',
];

function getExplorationBias(playlistArtists = []) {
  const shuffled = [...NICHE_GENRES].sort(() => Math.random() - 0.5);
  const tag1 = shuffled[0];
  const tag2 = shuffled[1];
  // Hardcoded artist pool for genre
  const artists1 = GENRE_ARTIST_MAP[tag1] || '';
  const artists2 = GENRE_ARTIST_MAP[tag2] || '';
  // User's playlist artists — pick 4 random as "similar-to" hints
  const userPool = playlistArtists.length
    ? playlistArtists.sort(() => Math.random() - 0.5).slice(0, 4).join(', ')
    : '';
  const pick1 = artists1 ? artists1.split(', ').sort(() => Math.random() - 0.5).slice(0, 2).join(', ') : '';
  const pick2 = artists2 ? artists2.split(', ').sort(() => Math.random() - 0.5).slice(0, 2).join(', ') : '';
  const tip = EXPLORATION_TIPS[Math.floor(Math.random() * EXPLORATION_TIPS.length)];
  const weather = getWeatherHint();
  const parts = [
    `🎯 本轮强制融合标签: 【${tag1}】+ 【${tag2}】`,
    `📋 风格参考池: ${[pick1, pick2].filter(Boolean).join(' | ') || '自由发挥'}`,
  ];
  if (userPool) parts.push(`🎧 你的歌单里有这些艺人: ${userPool}。找和他们风格相似但不同的新面孔。`);
  parts.push(`⚠️ 必须推荐同时具备这两个风格元素的歌曲。`);
  parts.push(`💡 ${tip}`);
  if (weather) parts.push(`🌤 ${weather}`);
  return parts.join('\n');
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
    return `### ❤️ 红心歌单 (Taste Compass)\n这些是用户收藏的歌，代表了核心品味方向。可以偶尔重温（30%），但更多时候请根据这些歌的**曲风元素**去挖掘新声音（70%）。\n红心列表：\n${liked}`;
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
