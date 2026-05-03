/**
 * WEATHER.JS — Open-Meteo free weather API (no key required)
 *
 * Auto-detects location via IP (ipapi.co), caches to state.
 * Falls back to .env LAT/LON or Beijing default.
 */

const state = (() => { try { return require('./state'); } catch { return null; } })();

const API = 'https://api.open-meteo.com/v1/forecast';

const WEATHER_MAP = {
  0:  '晴天', 1: '少云', 2: '多云', 3: '阴天',
  45: '雾', 48: '浓雾',
  51: '小雨', 53: '小雨', 55: '小雨',
  61: '雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪',
  80: '阵雨', 81: '阵雨', 82: '暴雨',
  95: '雷暴',
};

let cached = null;
let cachedAt = 0;
const TTL = 30 * 60 * 1000;

/**
 * Detect location: saved prefs > IP geolocation > .env > Beijing fallback.
 */
async function getLocation() {
  // 1. Saved location from state
  if (state) {
    const saved = state.getPref('location');
    if (saved?.lat && saved?.lon) return saved;
  }
  // 2. IP geolocation (free, no key)
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
    const ip = await res.json();
    if (ip.latitude && ip.longitude) {
      const loc = { lat: ip.latitude, lon: ip.longitude, city: ip.city, region: ip.region };
      if (state) state.setPref('location', loc);
      console.log(`[weather] Detected location: ${loc.city || ''}, ${loc.region || ''} (${loc.lat}, ${loc.lon})`);
      return loc;
    }
  } catch (e) { console.log('[weather] IP geolocation failed:', e.message); }
  // 3. .env fallback
  return {
    lat: parseFloat(process.env.LAT) || 39.9,
    lon: parseFloat(process.env.LON) || 116.4,
    city: process.env.CITY || 'Beijing',
  };
}

async function getWeather() {
  const now = Date.now();
  if (cached && now - cachedAt < TTL) return cached;

  try {
    const loc = await getLocation();
    const url = `${API}?latitude=${loc.lat}&longitude=${loc.lon}&current_weather=true&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json();
    const w = data.current_weather || {};

    const code = w.weathercode ?? 0;
    const desc = WEATHER_MAP[code] || `code:${code}`;
    const temp = w.temperature != null ? `${w.temperature}°C` : '';
    const wind = w.windspeed != null
      ? w.windspeed < 5 ? '无风' : w.windspeed < 15 ? '微风' : w.windspeed < 30 ? '大风' : '狂风'
      : '';
    const city = loc.city ? `${loc.city}` : '';

    cached = [city, desc, temp, wind].filter(Boolean).join('，');
    cachedAt = now;
    return cached;
  } catch (err) {
    console.error('[weather] Fetch failed:', err.message);
    return cached || '天气数据不可用';
  }
}

module.exports = { getWeather };
