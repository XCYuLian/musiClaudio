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
const MAX_SCHEDULER_FAILS = 3;
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
  // ── 器乐/氛围 ──
  { id: '1813926546', name: 'Lo-Fi Chill',     artist: 'Lofi' },
  { id: '523365012',  name: '轻音乐',           artist: '钢琴曲' },
  { id: '442682',     name: '天空の城ラピュタ',   artist: '久石譲' },
  { id: '492999917',  name: 'Merry Christmas Mr. Lawrence', artist: '坂本龍一' },
  { id: '1337135204', name: '爵士钢琴',          artist: 'MayPiano' },
  { id: '406232',     name: 'Luv Letter',       artist: 'DJ Okawari' },
  // ── 后摇 ──
  { id: '863073353',  name: '水之湄',            artist: '惘闻' },
  { id: '385322',     name: 'Lonely God',       artist: '惘闻' },
  { id: '1831469103', name: '希望像星光一样闪烁',  artist: '文雀' },
  { id: '31838188',   name: '大雁',             artist: '文雀' },
  // ── Jazz / Funk ──
  { id: '5131313',    name: 'Autumn Leaves',    artist: 'Diana Krall' },
  { id: '703639',     name: 'LOOKING UP',       artist: 'Casiopea' },
  { id: '436487025',  name: 'Dean Town',        artist: 'Vulfpeck' },
  { id: '27558051',   name: 'Wait for the Moment', artist: 'Vulfpeck' },
  { id: '2142410008', name: 'May Ninth',        artist: 'Khruangbin' },
  { id: '534544513',  name: 'Maria También',    artist: 'Khruangbin' },
  // ── 电子 ──
  { id: '348028',     name: '恐怖的房子',         artist: '超级市场' },
  { id: '347990',     name: 'SOS',              artist: '超级市场' },
  // ── 华语民谣/摇滚 ──
  { id: '386830',     name: '大石碎胸口',         artist: '万能青年旅店' },
  { id: '386844',     name: '杀死那个石家庄人',    artist: '万能青年旅店' },
  { id: '477251491',  name: '郭源潮',            artist: '宋冬野' },
  { id: '27646198',   name: '董小姐',            artist: '宋冬野' },
  { id: '35618531',   name: '旧情人，我是时间的新欢', artist: '尧十三' },
  { id: '31445772',   name: '理想三旬',          artist: '陈鸿宇' },
  { id: '463157222',  name: '一如年少模样',       artist: '陈鸿宇' },
  { id: '25638827',   name: '喜欢寂寞',          artist: '苏打绿' },
  { id: '28018273',   name: '流浪者之歌',         artist: '陈绮贞' },
  // ── 华语R&B / 台独 ──
  { id: '524152311',  name: '神探',             artist: '丁世光' },
  { id: '420401511',  name: '和你',             artist: '余佳运' },
  { id: '557579126',  name: '恋恋夏日咏叹',       artist: '阿克江Akin' },
  { id: '1320101152', name: '海浪',             artist: 'deca joins' },
  { id: '483378334',  name: '浴室',             artist: 'deca joins' },
  { id: '1411718813', name: '我是一只鱼',         artist: '落日飞车' },
  { id: '438462713',  name: 'My Jinji',         artist: '落日飞车' },
  { id: '2717465891', name: '你知道天空有多蓝',    artist: '椅子乐团' },
  { id: '150411',     name: '普通朋友 (Live)',    artist: '陶喆' },
];

const LOCAL_FALLBACK_QUERIES = ['周杰伦 晴天', '陈奕迅 十年', '林俊杰 江南', '王菲 红豆', '张学友 吻别'];

// ── Dedup ──
// (removed — user likes these artists)

module.exports = {
  DEEPSEEK_API_URL, DEEPSEEK_MODEL, DEEPSEEK_MAX_RETRIES, DEEPSEEK_TIMEOUT_MS,
  DAILY_TOKEN_LIMIT,
  MAX_FAIL_STREAK, MAX_SCHEDULER_FAILS, MAX_FALLBACK_RETRIES, REFILL_COOLDOWN_MS,
  TTS_DEFAULT_APPID, TTS_DEFAULT_SPEAKER, TTS_TIMEOUT_MS, TTS_STREAM_TIMEOUT_MS,
  FADE_STEPS, FADE_DURATION_MS, FADE_MIN_VOLUME, TTS_DELAY_MS, REFILL_PRE_FETCH_SEC,
  MODULE_THROTTLE_MS, SEARCH_LIMIT, BAD_KEYWORDS,
  HARD_FALLBACK_IDS, LOCAL_FALLBACK_QUERIES,
};
