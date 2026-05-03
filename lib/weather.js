/**
 * WEATHER.JS — Open-Meteo free weather API (no key required)
 *
 * Returns current weather as a Chinese description string
 * for injection into the LLM context.
 *
 * Config: LAT / LON in .env (default: Beijing)
 */

const LAT = parseFloat(process.env.LAT) || 39.9;
const LON = parseFloat(process.env.LON) || 116.4;
const API = 'https://api.open-meteo.com/v1/forecast';

// WMO weather codes → Chinese description
const WEATHER_MAP = {
  0:  '晴天',
  1:  '少云', 2: '多云', 3: '阴天',
  45: '雾', 48: '浓雾',
  51: '小雨', 53: '小雨', 55: '小雨',
  61: '雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪',
  80: '阵雨', 81: '阵雨', 82: '暴雨',
  95: '雷暴',
};

let cached = null;
let cachedAt = 0;
const TTL = 30 * 60 * 1000; // 30 min

/**
 * Get current weather description in Chinese.
 * @returns {Promise<string>} e.g. "多云，18°C，微风"
 */
async function getWeather() {
  const now = Date.now();
  if (cached && now - cachedAt < TTL) return cached;

  try {
    const url = `${API}?latitude=${LAT}&longitude=${LON}&current_weather=true&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    const w = data.current_weather || {};

    const code = w.weathercode ?? 0;
    const desc = WEATHER_MAP[code] || `code:${code}`;
    const temp = w.temperature != null ? `${w.temperature}°C` : '';
    const wind = w.windspeed != null
      ? w.windspeed < 5 ? '无风' : w.windspeed < 15 ? '微风' : w.windspeed < 30 ? '大风' : '狂风'
      : '';

    cached = [desc, temp, wind].filter(Boolean).join('，');
    cachedAt = now;
    return cached;
  } catch (err) {
    console.error('[weather] Fetch failed:', err.message);
    return cached || '天气数据不可用';
  }
}

module.exports = { getWeather };
