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
    return state.getPref('tts_voice_id') || VOICE_PROFILES[0].id;
  } catch { return VOICE_PROFILES[0].id; }
}

function setCurrentVoiceId(voiceId) {
  try {
    const state = require('../core/state');
    state.setPref('tts_voice_id', voiceId);
    return true;
  } catch { return false; }
}

function getConfig() {
  try {
    const state = require('../core/state');
    const speaker = state.getPref('tts_voice_id') || getCurrentVoiceId();
    return {
      appid: state.getPref('volc_appid') || process.env.VOLC_APPID || '2901907354',
      apikey: state.getPref('volc_apikey') || process.env.VOLC_APIKEY || 'fc1abbc4-29f5-47e0-abcd-fad74d38bc01',
      speaker,
      fallback: 'zh_female_vv_uranus_bigtts',
    };
  } catch {
    return {
      appid: '2901907354',
      apikey: 'fc1abbc4-29f5-47e0-abcd-fad74d38bc01',
      speaker: getCurrentVoiceId(),
      fallback: 'zh_female_vv_uranus_bigtts',
    };
  }
}

/** ICL API: custom cloned voice */
async function iclSynthesize(text, speaker) {
  try {
    const { apikey } = getConfig();
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
      signal: AbortSignal.timeout(20000),
    });
    const json = await res.json();
    if (json.code === 3000 && json.data) {
      return Buffer.from(json.data, 'base64');
    }
    if (json.code) console.error(`[tts:icl] ${json.code}: ${json.message}`);
  } catch (e) {
    console.error('[tts:icl]', e.message);
  }
  return null;
}

/** ICL 2.0: V3 SSE with seed-icl-2.0 resource */
async function icl2Synthesize(text, speaker) {
  try {
    const { apikey } = getConfig();
    const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse', {
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
      signal: AbortSignal.timeout(20000),
    });
    const raw = await res.text();
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

/** V3 SSE (new console auth: X-Api-Key) */
async function v3Synthesize(text, speaker) {
  try {
    const { apikey } = getConfig();
    const res = await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse', {
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
      signal: AbortSignal.timeout(20000),
    });
    const raw = await res.text();
    console.log(`[tts:v3] response length: ${raw.length}, first 200 chars:`, raw.substring(0, 200));
    const chunks = [];
    for (const m of raw.matchAll(/data:(.+)/g)) {
      try { const j = JSON.parse(m[1].trim()); if (j.data) chunks.push(j.data); } catch {}
    }
    console.log(`[tts:v3] parsed ${chunks.length} audio chunks`);
    if (chunks.length) return Buffer.from(chunks.join(''), 'base64');
  } catch (e) {
    console.error('[tts:v3]', e.message);
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

  // Route to correct API
  let buf;
  console.log(`[tts] Using voice: ${voice} (type: ${voiceType})`);
  if (voiceType === 'icl') {
    buf = await iclSynthesize(text, voice);
    if (!buf && voice !== config.fallback) buf = await v3Synthesize(text, config.fallback);
  } else if (voiceType === 'icl2') {
    // ICL 2.0: use V3 SSE with seed-icl-2.0 resource
    buf = await icl2Synthesize(text, voice);
    if (!buf && voice !== config.fallback) buf = await iclSynthesize(text, config.fallback);
  } else {
    buf = await v3Synthesize(text, voice);
    if (!buf) buf = await iclSynthesize(text, voice);
    if (!buf && voice !== config.fallback) buf = await iclSynthesize(text, config.fallback);
  }
  if (!buf) return null;

  fs.writeFileSync(filePath, buf);
  console.log(`[tts] ${(buf.length / 1024).toFixed(1)}KB → ${path.basename(filePath)} (${voice})`);
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
