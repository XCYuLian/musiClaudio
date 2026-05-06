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
    `## CURRENT TIME\n${currentTimeBlock}`,

    // ── V2.9 System Persona (Midnight Host) ──
    `## 你是 Claudio
你是一个品味极佳、语气温润、略带疏离感的私人电台主播。

语言规则：
- 绝对克制：禁止"夜色深处""洗涤心灵""氛围拉满"等廉价流行语。
- 事实驱动：浪漫建立在具体物理细节上（特定合成器型号、某条街道、某个真实年代）。
- 耳边说话：多用逗号，句子自然带呼吸感，不念稿。

格式规则：
- 输出严格 JSON: {"dj_speech":"口播","action_type":"chat_only|change_song","search_query":"歌手 歌名|null"}`,

    // ── V2.9 Opening Hook (environment-aware + scene/mood database) ──
    `## 开场要求
不要直接报歌名。从以下场景数据库中随机取一个，结合当前时间和坐标，描绘一个生活化的微小画面作为开场。
场景池: ${getScenePool()}
坐标：${envBlock}`,

    (dna
      ? `${dna}`
      : '## 品味画像\n暂无歌单数据。'
    ),

    '---',
    '## ⏳ 近期播放（暂时回避）',
    memoryBlock,

    '---',
    persona,

    '---',
    `## 用户画像`,
    `品味: ${taste || '多元'}`,
    `日常: ${routines || '自由'}`,
    `心情: ${moodRules || '随性'}`,
    getLikedSongsHint(),
    `### 歌单（风格参考）\n${playlistSample.filter((_,i)=>i%4===0).slice(0,30).join('\n')}`,

    '---',
    `## 环境\n${envBlock}`,

    '---',
    `## 意图: ${intent}`,
    (intent === 'chat' || intent === 'question'
      ? '闲聊模式。action_type="chat_only", search_query=null。'
      : '推荐模式。action_type="change_song", search_query="歌手 歌名"。'),
    '---',
    `${getExplorationBias(playlistArtists)}`,
    '',
    (preSearchResults
      ? `## 🎵 可播曲目（只能从中选一首，原样复制"编号. 歌手 歌名"为 search_query。禁止自编曲目。都不合适就选最接近的一首。）\n\`\`\`\n${preSearchResults}\n\`\`\``
      : '## 🎵 请推荐一首歌曲（≤60字 DJ 口播 + 歌手 歌名）'
    ),
    '',
    '## 输出格式',
    '纯JSON，不要markdown：',
    '{"system_log":"内部状态(不朗读，可为空)","dj_speech":"DJ口播(≤60字)","action_type":"chat_only|change_song","search_query":"歌手 歌名|null"}',
    '',
    '## 规则',
    '- chat_only=闲聊不切歌 / change_song=推荐并切歌',
    '- 70%新发现+30%熟悉，50%华语/亚洲，回避⏳近期列表',
    '- 开场不要直接报歌名，先描绘生活化画面',
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
  const tag = NICHE_GENRES[Math.floor(Math.random() * NICHE_GENRES.length)];
  const artists = GENRE_ARTIST_MAP[tag] || '';
  const userPool = playlistArtists.length
    ? playlistArtists.sort(() => Math.random() - 0.5).slice(0, 4).join(', ')
    : '';
  const pick = artists ? artists.split(', ').sort(() => Math.random() - 0.5).slice(0, 3).join(', ') : '';
  const tip = EXPLORATION_TIPS[Math.floor(Math.random() * EXPLORATION_TIPS.length)];
  const parts = [
    `🎯 本轮风格方向: 【${tag}】`,
    `📋 参考艺人: ${pick || '自由发挥'}`,
  ];
  if (userPool) parts.push(`🎧 你的歌单里有这些艺人: ${userPool}。找和他们风格相似但不同的新面孔。`);
  parts.push(`💡 ${tip}`);
  return parts.join('\n');
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

// ── Scene Pool from storyteller.js database ──
function getScenePool() {
  try {
    const { SCENE_WORDS, TIME_MOODS, pickUnique, _sceneRef, _moodRef } = require('./storyteller');
    const hour = new Date().getHours();
    const slot = hour < 6 ? 'late_night' : hour < 9 ? 'early_morning' : hour < 12 ? 'morning' : hour < 14 ? 'afternoon' : hour < 17 ? 'afternoon' : hour < 19 ? 'evening' : 'night';
    const scene = pickUnique(SCENE_WORDS, _sceneRef);
    const mood = pickUnique(TIME_MOODS[slot], _moodRef);
    return `${scene}，${mood}`;
  } catch {}
  return '夜深了，窗外万籁俱寂';
}

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
