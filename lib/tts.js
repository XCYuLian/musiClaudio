/**
 * TTS.JS — Fish Audio 语音合成管线
 *
 * Pipeline:
 *   text → Fish Audio API → cache/tts/<hash>.mp3 → /tts/<hash>.mp3 URL
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FISH_AUDIO_API_URL = process.env.FISH_AUDIO_API_URL || 'https://api.fish.audio/v1/tts';
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY || '';
const CACHE_DIR = path.resolve(__dirname, '..', 'cache', 'tts');

// Default voice: a warm, natural Chinese voice
const DEFAULT_VOICE = 'female-casual';
const DEFAULT_FORMAT = 'mp3';

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Synthesize speech from text. Returns URL path to the cached audio file.
 * Skips API call if file already exists in cache (content-based hash).
 *
 * @param {string} text
 * @param {Object} [opts]
 * @param {string} [opts.voice]
 * @returns {Promise<string>} URL path like /tts/<hash>.mp3
 */
async function synthesize(text, opts = {}) {
  const { voice = DEFAULT_VOICE } = opts;

  if (!text || !text.trim()) {
    throw new Error('TTS: text is required');
  }

  // Content-addressable cache key
  const hash = crypto.createHash('sha256').update(text + voice).digest('hex').slice(0, 16);
  const filename = `${hash}.${DEFAULT_FORMAT}`;
  const filePath = path.join(CACHE_DIR, filename);

  // Cache hit
  if (fs.existsSync(filePath)) {
    return `/tts/${filename}`;
  }

  // Ensure cache dir
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  if (!FISH_AUDIO_API_KEY) {
    throw new Error('TTS: FISH_AUDIO_API_KEY is not set');
  }

  const response = await fetch(FISH_AUDIO_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FISH_AUDIO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text.trim(),
      voice,
      format: DEFAULT_FORMAT,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Fish Audio API error ${response.status}: ${errBody.slice(0, 300)}`);
  }

  // Fish Audio returns binary audio directly
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return `/tts/${filename}`;
}

/**
 * Synthesize multiple segments sequentially (respects API rate limits).
 * @param {Array<{text: string, voice?: string}>} segments
 * @returns {Promise<string[]>} Array of URL paths
 */
async function synthesizeBatch(segments) {
  const results = [];
  for (const seg of segments) {
    const url = await synthesize(seg.text, { voice: seg.voice });
    results.push(url);
    // Small delay between requests to avoid rate limiting
    await sleep(300);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
module.exports = { synthesize, synthesizeBatch };
