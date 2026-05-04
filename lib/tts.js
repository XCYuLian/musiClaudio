/**
 * TTS.JS — Volcengine ICL (声音复刻) TTS
 *
 * Uses the user's custom cloned voice via V1 ICL API.
 * Voice: S_xSgIXKL12 (custom male DJ voice)
 * Fallback: zh_female_vv_uranus_bigtts (V3 SSE)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('./paths');

const CACHE_DIR = paths.TTS;

function getConfig() {
  try {
    const state = require('./state');
    return {
      appid: state.getPref('volc_appid') || process.env.VOLC_APPID || '2901907354',
      apikey: state.getPref('volc_apikey') || process.env.VOLC_APIKEY || 'fc1abbc4-29f5-47e0-abcd-fad74d38bc01',
      speaker: state.getPref('volc_speaker') || process.env.VOLC_SPEAKER || 'S_xSgIXKL12',
      fallback: 'zh_female_vv_uranus_bigtts',
    };
  } catch {
    return {
      appid: '2901907354',
      apikey: 'fc1abbc4-29f5-47e0-abcd-fad74d38bc01',
      speaker: 'S_xSgIXKL12',
      fallback: 'zh_female_vv_uranus_bigtts',
    };
  }
}

/** ICL API: custom cloned voice */
async function iclSynthesize(text, speaker) {
  try {
    const { appid, apikey } = getConfig();
    const res = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apikey,
      },
      body: JSON.stringify({
        app: { cluster: 'volcano_icl' },
        user: { uid: 'claudio' },
        audio: { voice_type: speaker, encoding: 'mp3', speed_ratio: 1.0 },
        request: { reqid: crypto.randomUUID(), text: text.trim(), text_type: 'plain', operation: 'query' },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json();
    if (json.code === 3000 && json.data) {
      // data IS the base64 MP3
      return Buffer.from(json.data, 'base64');
    }
    if (json.code) console.error(`[tts:icl] ${json.code}: ${json.message}`);
  } catch (e) {
    console.error('[tts:icl]', e.message);
  }
  return null;
}

/** V3 SSE fallback: zh_female_vv_uranus_bigtts */
async function v3Synthesize(text, speaker) {
  try {
    const { appid, apikey } = getConfig();
    const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Id': appid,
        'X-Api-Access-Key': apikey,
        'X-Api-Resource-Id': 'seed-tts-2.0',
        'X-Api-Connect-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        user: { uid: 'claudio' },
        event: 100,
        req_params: {
          text: text.trim(),
          speaker,
          audio_params: { format: 'mp3', sample_rate: 24000, bit_rate: 128000 },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const raw = await res.text();
    const chunks = [];
    for (const m of raw.matchAll(/data:(.+)/g)) {
      try { const j = JSON.parse(m[1].trim()); if (j.data) chunks.push(j.data); } catch {}
    }
    if (chunks.length) return Buffer.from(chunks.join(''), 'base64');
  } catch (e) {
    console.error('[tts:v3]', e.message);
  }
  return null;
}

async function synthesize(text, opts = {}) {
  if (!text || !text.trim()) return null;
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  const { speaker, fallback } = { ...getConfig(), ...opts };
  const voice = opts.voice || speaker;
  const hash = crypto.createHash('sha256').update(text + voice).digest('hex').slice(0, 16);
  const filePath = path.join(CACHE_DIR, `volc_${hash}.mp3`);
  if (fs.existsSync(filePath)) return filePath;

  // Try ICL custom voice first, then V3 fallback
  let buf = await iclSynthesize(text, voice);
  if (!buf && voice !== fallback) buf = await v3Synthesize(text, fallback);
  if (!buf) return null;

  fs.writeFileSync(filePath, buf);
  console.log(`[tts] ${(buf.length / 1024).toFixed(1)}KB → ${path.basename(filePath)}`);
  return filePath;
}

async function synthesizeBatch(segments) {
  const results = [];
  for (const seg of segments) {
    const r = await synthesize(seg.text, { voice: seg.voice });
    results.push(r);
    await new Promise(r => setTimeout(r, 300));
  }
  return results;
}

module.exports = { synthesize, synthesizeBatch };
