/**
 * TTS.JS — Volcengine Multi-Voice TTS
 *
 * Supports multiple voice profiles with state persistence.
 * Voice switching via VOX panel in UI.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('../core/paths');
const { TTS_TIMEOUT_MS, TTS_STREAM_TIMEOUT_MS } = require('../core/config');

const CACHE_DIR = paths.TTS;

// ── Voice Profiles ──
const VOICE_PROFILES = [
  {
    id: 'saturn_zh_male_shuanglangshaonian_tob',
    name: '飒爽',
    desc: '少年感男声 · 清朗明亮',
    type: 'v3',
  },
  {
    id: 'zh_male_m191_uranus_bigtts',
    name: '磐石',
    desc: '沉稳男声 · 大气厚重',
    type: 'v3',
  },
  {
    id: 'zh_female_wenjingmaomao_uranus_bigtts',
    name: 'Girl',
    desc: '温柔女声 · 安静娓娓',
    type: 'v3',
  },
  {
    id: 'S_xSgIXKL12',
    name: '核心 1.0',
    desc: '专属克隆男声 · 温暖磁性',
    type: 'icl',
  },
  {
    id: 'S_Pd5HXKL12',
    name: '核心 2.0',
    desc: '专属克隆 · ICL 2.0 增强',
    type: 'icl2',
  },
];

function getVoiceProfiles() {
  return VOICE_PROFILES;
}

function getCurrentVoiceId() {
  try {
    const state = require('../core/state');
    const saved = state.getPref('tts_voice_id');
    if (saved && VOICE_PROFILES.some(p => p.id === saved)) return saved;
    return VOICE_PROFILES[0].id;
  } catch { return VOICE_PROFILES[0].id; }
}

function setCurrentVoiceId(voiceId) {
  try {
    const state = require('../core/state');
    state.setPref('tts_voice_id', voiceId);
    return true;
  } catch { return false; }
}

const FALLBACK_V3 = 'saturn_zh_male_shuanglangshaonian_tob';
const FALLBACK_ICL = 'S_xSgIXKL12';

function getConfig() {
  try {
    const state = require('../core/state');
    const speaker = getCurrentVoiceId();
    return {
      appid: state.getPref('volc_appid') || process.env.VOLC_APPID || '2901907354',
      apikey: state.getPref('volc_apikey') || process.env.VOLC_APIKEY || 'fc1abbc4-29f5-47e0-abcd-fad74d38bc01',
      speaker,
      fallback_v3: FALLBACK_V3,
      fallback_icl: FALLBACK_ICL,
    };
  } catch {
    return {
      appid: '2901907354',
      apikey: 'fc1abbc4-29f5-47e0-abcd-fad74d38bc01',
      speaker: getCurrentVoiceId(),
      fallback_v3: FALLBACK_V3,
      fallback_icl: FALLBACK_ICL,
    };
  }
}

/** ICL API: custom cloned voice */
async function iclSynthesize(text, speaker) {
  const t0 = Date.now();
  try {
    const { apikey } = getConfig();
    console.log(`[tts:icl] → POST ${text.slice(0,20)}... voice=${speaker} key=${apikey.slice(0,8)}...`);
    const res = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apikey,
      },
      body: JSON.stringify({
        app: { cluster: 'volcano_icl' },
        user: { uid: 'claudio' },
        audio: { voice_type: speaker, encoding: 'mp3', speed_ratio: 0.85 },
        request: { reqid: crypto.randomUUID(), text: text.trim(), text_type: 'plain', operation: 'query' },
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    console.log(`[tts:icl] ← ${res.status} ${res.statusText} (${Date.now()-t0}ms)`);
    const json = await res.json();
    if (json.code === 3000 && json.data) {
      return Buffer.from(json.data, 'base64');
    }
    console.error(`[tts:icl] code=${json.code} message=${json.message}`);
  } catch (e) {
    console.error(`[tts:icl] FAIL (${Date.now()-t0}ms):`, e.message);
  }
  return null;
}

/** ICL 2.0: V3 SSE with seed-icl-2.0 resource — two-phase timeout */
async function icl2Synthesize(text, speaker) {
  try {
    const { apikey } = getConfig();
    const ctrl = new AbortController();
    const connectTimer = setTimeout(() => ctrl.abort(), TTS_TIMEOUT_MS);
    let res;
    try {
      res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apikey,
          'X-Api-Resource-Id': 'seed-icl-2.0',
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
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(connectTimer);
    }
    let raw;
    try {
      raw = await Promise.race([
        res.text(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Stream timeout')), TTS_STREAM_TIMEOUT_MS)),
      ]);
    } catch (e) {
      console.error('[tts:icl2] Stream FAIL:', e.message);
      return null;
    }
    const chunks = [];
    for (const m of raw.matchAll(/data:(.+)/g)) {
      try { const j = JSON.parse(m[1].trim()); if (j.data) chunks.push(j.data); } catch {}
    }
    if (chunks.length) return Buffer.from(chunks.join(''), 'base64');
  } catch (e) {
    console.error('[tts:icl2]', e.message);
  }
  return null;
}

/** V3 SSE (new console auth: X-Api-Key) — two-phase timeout: connect fast, stream slow */
async function v3Synthesize(text, speaker) {
  const t0 = Date.now();
  try {
    const { apikey } = getConfig();
    console.log(`[tts:v3] → POST ${text.slice(0,20)}... voice=${speaker} key=${apikey.slice(0,8)}...`);
    const ctrl = new AbortController();
    const connectTimer = setTimeout(() => ctrl.abort(), TTS_TIMEOUT_MS);
    let res;
    try {
      res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apikey,
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
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(connectTimer);
    }
    console.log(`[tts:v3] ← ${res.status} ${res.statusText} (${Date.now()-t0}ms)`);
    // Stream body: can take 60s+ for long text — race against timeout
    let raw;
    try {
      raw = await Promise.race([
        res.text(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Stream timeout')), TTS_STREAM_TIMEOUT_MS)),
      ]);
    } catch (e) {
      console.error(`[tts:v3] Stream FAIL (${Date.now()-t0}ms):`, e.message);
      return null;
    }
    const chunks = [];
    for (const m of raw.matchAll(/data:(.+)/g)) {
      try { const j = JSON.parse(m[1].trim()); if (j.data) chunks.push(j.data); } catch {}
    }
    if (chunks.length) return Buffer.from(chunks.join(''), 'base64');
    console.error('[tts:v3] no audio chunks in response (len=' + raw.length + ')');
  } catch (e) {
    console.error(`[tts:v3] FAIL (${Date.now()-t0}ms):`, e.message);
  }
  return null;
}

async function synthesize(text, opts = {}) {
  if (!text || !text.trim()) return null;
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  const config = getConfig();
  const voice = opts.voice || config.speaker;
  const voiceType = VOICE_PROFILES.find(p => p.id === voice)?.type || 'icl';
  const hash = crypto.createHash('sha256').update(text + voice).digest('hex').slice(0, 16);
  const filePath = path.join(CACHE_DIR, `volc_${hash}.mp3`);
  if (fs.existsSync(filePath)) return filePath;

  // Route to correct API, then cross-fallback on failure
  let buf;
  if (voiceType === 'icl') {
    buf = await iclSynthesize(text, voice);
    if (!buf && voice !== config.fallback_v3) buf = await v3Synthesize(text, config.fallback_v3);
  } else if (voiceType === 'icl2') {
    buf = await icl2Synthesize(text, voice);
    if (!buf && voice !== config.fallback_icl) buf = await iclSynthesize(text, config.fallback_icl);
  } else {
    // V3: try V3 → ICL fallback → V3 fallback
    buf = await v3Synthesize(text, voice);
    if (!buf && voice !== config.fallback_icl) buf = await iclSynthesize(text, config.fallback_icl);
    if (!buf) buf = await v3Synthesize(text, config.fallback_v3);
  }
  if (!buf) return null;

  fs.writeFileSync(filePath, buf);
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

module.exports = { synthesize, synthesizeBatch, getVoiceProfiles, getCurrentVoiceId, setCurrentVoiceId };
