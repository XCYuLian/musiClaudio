/**
 * CONFIG.JS — Global Configuration Hub (V2.9)
 *
 * All tunable constants live here. No more magic numbers scattered across files.
 */

// ── DeepSeek ──
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const DEEPSEEK_MAX_RETRIES = 2;
const DEEPSEEK_TIMEOUT_MS = 30000;

// ── Rate Limiting ──
const DAILY_TOKEN_LIMIT = parseInt(process.env.DAILY_TOKEN_LIMIT) || 100000;

// ── Circuit Breaker ──
const MAX_FAIL_STREAK = 3;
const MAX_SCHEDULER_FAILS = 1;
const MAX_FALLBACK_RETRIES = 3;
const REFILL_COOLDOWN_MS = 30000;

// ── TTS ──
const TTS_DEFAULT_APPID = process.env.VOLC_APPID || '2901907354';
const TTS_DEFAULT_SPEAKER = process.env.TTS_SPEAKER || 'saturn_zh_male_shuanglangshaonian_tob';
const TTS_TIMEOUT_MS = 15000;    // 15s connect timeout
const TTS_STREAM_TIMEOUT_MS = 120000;  // 120s — full SSE stream for long story audio

// ── Audio ──
const FADE_STEPS = 6;
const FADE_DURATION_MS = 400;
const FADE_MIN_VOLUME = 0.15;
const TTS_DELAY_MS = 300;
const REFILL_PRE_FETCH_SEC = 10;

// ── Netease ──
const MODULE_THROTTLE_MS = 60000;   // 60s throttle after 405
const SEARCH_LIMIT = 15;
const BAD_KEYWORDS = [
  'dj', 'remix', 'live', '现场', '翻唱', '翻自', '伴奏', '串烧', '铃声', '抖音',
  'cover', 'sped up', 'mix', 'dj版', 'remix版', '合唱', '纯音乐', 'instrumental',
  'karaoke', '消音', '模仿', '改编', '翻奏', '粤语版', '国语版', '英文版', '日语版', '韩语版', '变奏', '慢摇',
];

// ── Fallback ──
const HARD_FALLBACK_IDS = [
  { id: '1813926546', name: 'Lo-Fi Chill', artist: 'Lofi' },
  { id: '19500000',   name: 'Ambient',     artist: 'Ambient' },
  { id: '523365012',  name: '轻音乐',      artist: '钢琴曲' },
  { id: '33894345',   name: 'Rain',        artist: 'Nature' },
  { id: '186043',     name: '十年',        artist: '陈奕迅' },
];

const LOCAL_FALLBACK_QUERIES = ['周杰伦 晴天', '陈奕迅 十年', '林俊杰 江南', '王菲 红豆', '张学友 吻别'];

// ── Dedup ──
const PERMA_BLOCKED_ARTISTS = ['bonobo', 'toe', 'uyama hiroto', 'nujabes', 'dj okawari'];

module.exports = {
  DEEPSEEK_API_URL, DEEPSEEK_MODEL, DEEPSEEK_MAX_RETRIES, DEEPSEEK_TIMEOUT_MS,
  DAILY_TOKEN_LIMIT,
  MAX_FAIL_STREAK, MAX_SCHEDULER_FAILS, MAX_FALLBACK_RETRIES, REFILL_COOLDOWN_MS,
  TTS_DEFAULT_APPID, TTS_DEFAULT_SPEAKER, TTS_TIMEOUT_MS, TTS_STREAM_TIMEOUT_MS,
  FADE_STEPS, FADE_DURATION_MS, FADE_MIN_VOLUME, TTS_DELAY_MS, REFILL_PRE_FETCH_SEC,
  MODULE_THROTTLE_MS, SEARCH_LIMIT, BAD_KEYWORDS,
  HARD_FALLBACK_IDS, LOCAL_FALLBACK_QUERIES,
  PERMA_BLOCKED_ARTISTS,
};
