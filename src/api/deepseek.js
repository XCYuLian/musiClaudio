/**
 * DEEPSEEK.JS — DeepSeek API Adapter
 *
 * Responsibilities:
 * 1. Send assembled prompts to the DeepSeek API (OpenAI-compatible)
 * 2. Enforce STRICT JSON output → strip markdown fences, extract object
 * 3. Validate returned JSON matches the {system_log, dj_speech, action_type, search_query} schema
 * 4. Surface actionable errors (HTTP, parse, schema) without crashing the caller
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const {
  DEEPSEEK_API_URL, DEEPSEEK_MODEL, DEEPSEEK_MAX_RETRIES, DEEPSEEK_TIMEOUT_MS,
  DAILY_TOKEN_LIMIT,
} = require('../core/config');

const DEFAULT_API_KEY = 'sk-08fbfccc9bbd47d5822a345706e1b418';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Read API key: env override > default (for distribution) */
function getApiKey() {
  return process.env.DEEPSEEK_API_KEY || DEFAULT_API_KEY;
}

// ── Daily rate limiter ──
function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function isStationMaster() {
  try {
    const state = require('../core/state');
    const nickname = state.getPref('netease_nickname') || '';
    return nickname === '秋夢伴点星';
  } catch { return false; }
}

function checkDailyLimit() {
  // Station master: unlimited tokens
  if (isStationMaster()) return true;
  try {
    const state = require('../core/state');
    const today = getToday();
    const saved = state.getPref('daily_tokens') || {};
    if (saved.date !== today) {
      state.setPref('daily_tokens', { date: today, used: 0 });
      return true;
    }
    if (saved.used >= DAILY_TOKEN_LIMIT) {
      return false;
    }
    return true;
  } catch { return true; }
}

function addDailyTokens(tokens) {
  try {
    const state = require('../core/state');
    const today = getToday();
    const saved = state.getPref('daily_tokens') || { date: today, used: 0 };
    if (saved.date !== today) saved.used = 0;
    saved.used += tokens;
    saved.date = today;
    state.setPref('daily_tokens', saved);
  } catch { /* state not ready */ }
}

// Required fields: speech + action_type + search_query
const REQUIRED_FIELDS = ['system_log', 'dj_speech', 'action_type', 'search_query'];
const VALID_ACTIONS = ['chat_only', 'change_song'];

// ---------------------------------------------------------------------------
// JSON extraction — handles all known model output quirks
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a valid JSON object from arbitrary model output.
 * Tries multiple strategies in order, from strictest to most lenient.
 */
function extractJSON(text) {
  const raw = text.trim();

  // ─ Strategy 1: direct parse (ideal case) ─
  try {
    const obj = JSON.parse(raw);
    if (isLikelyDJResponse(obj)) return obj;
  } catch { /* continue */ }

  // ─ Strategy 2: strip ```json ... ``` fences ─
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const obj = JSON.parse(fenceMatch[1].trim());
      if (isLikelyDJResponse(obj)) return obj;
    } catch { /* continue */ }
  }

  // ─ Strategy 3: find outermost { ... } ─
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const obj = JSON.parse(braceMatch[0]);
      if (isLikelyDJResponse(obj)) return obj;
    } catch { /* continue */ }

    // Sub-strategy: try to fix common JSON issues inside the braces
    try {
      const fixed = braceMatch[0]
        .replace(/:\s*'([^']*)'/g, ': "$1"')  // single-quoted values → double
        .replace(/(\w+):/g, '"$1":')            // unquoted keys → quoted
        .replace(/,\s*}/g, '}')                  // trailing commas
        .replace(/,\s*]/g, ']');
      const obj = JSON.parse(fixed);
      if (isLikelyDJResponse(obj)) return obj;
    } catch { /* last resort failed */ }
  }

  // ─ Failure ─
  const preview = raw.length > 500 ? raw.slice(0, 500) + '…' : raw;
  throw new ParseError(`Cannot extract valid JSON from model output`, preview);
}

// Heuristic: is this object likely a DJ response (has at least "say" field)?
function isLikelyDJResponse(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return typeof obj.dj_speech === 'string' || typeof obj.speech === 'string' || typeof obj.say === 'string';
}

// ---------------------------------------------------------------------------
// Schema validation: speech + action_type + search_query
// ---------------------------------------------------------------------------

function validateResponse(obj) {
  // Backward compat
  if (!obj.system_log && obj.speech) obj.system_log = '';
  if (!obj.dj_speech && obj.speech) obj.dj_speech = obj.speech;
  if (!obj.dj_speech && obj.say) obj.dj_speech = obj.say;
  if (!obj.dj_speech && obj.monologue) obj.dj_speech = obj.monologue;
  if (!obj.action_type && obj.play?.length) obj.action_type = 'change_song';
  if (!obj.action_type) obj.action_type = 'chat_only';
  if (!obj.search_query && obj.play?.[0]) obj.search_query = obj.play[0];
  if (!obj.search_query) obj.search_query = null;
  if (!obj.system_log) obj.system_log = '';

  if (typeof obj.dj_speech !== 'string' || !obj.dj_speech.trim()) {
    throw new SchemaError('Field "dj_speech" must be a non-empty string', obj);
  }
  if (!VALID_ACTIONS.includes(obj.action_type)) {
    throw new SchemaError(`action_type must be one of: ${VALID_ACTIONS.join(', ')}`, obj);
  }
  if (obj.action_type === 'change_song' && (!obj.search_query || typeof obj.search_query !== 'string')) {
    throw new SchemaError('change_song requires search_query', obj);
  }

  return {
    system_log:   (obj.system_log || '').trim(),
    dj_speech:    obj.dj_speech.trim(),
    action_type:  obj.action_type,
    search_query: obj.search_query || null,
  };
}

// ---------------------------------------------------------------------------
// Core: send prompt to DeepSeek, get parsed DJ response
// ---------------------------------------------------------------------------

let _callSeq = 0;
const _sessionId = Math.random().toString(36).slice(2, 5);

/**
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {Object} [options]
 * @param {number} [options.temperature=0.7]
 * @param {number} [options.maxTokens=4096]
 * @param {string} [options.model]
 * @returns {Promise<{say:string, play:string[], reason:string, segue:string}>}
 */
async function askDeepSeek(systemPrompt, userMessage, options = {}) {
  const {
    temperature = 0.7,
    maxTokens = 1024,
  } = options;

  const callId = `${_sessionId}:${++_callSeq}`;

  // Resolve model: explicit override > state prefs > env default
  let model = options.model || DEEPSEEK_MODEL;
  try {
    const state = require('../core/state');
    const pref = state.getPref('model');
    if (pref && !options.model) model = pref;
  } catch { /* state not initialized yet, use env default */ }

  if (!getApiKey()) {
    throw new ConfigError('DEEPSEEK_API_KEY is not set. Set it in Settings or .env file.');
  }

  // Daily rate limit
  if (isStationMaster()) {
    // Station master — unlimited, no log spam
  } else if (!checkDailyLimit()) {
    console.warn(`[deepseek:${callId}] Daily token limit reached (${DAILY_TOKEN_LIMIT.toLocaleString()} tokens).`);
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };

  let lastError = null;
  let lastRawText = '';  // hoisted so retry nudge can reference actual model output

  for (let attempt = 0; attempt <= DEEPSEEK_MAX_RETRIES; attempt++) {
    // Exponential backoff: 1s, 2s, 4s between retries (max 8s)
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`[deepseek:${callId}] backoff ${delay}ms before retry ${attempt + 1}`);
      await sleep(delay);
    }
    try {
      // --- HTTP call (30s timeout to prevent indefinite hang) ---
      const t0 = Date.now();
      console.log(`[deepseek:${callId}] → POST attempt=${attempt+1} model=${model} key=${getApiKey().slice(0,8)}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(DEEPSEEK_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getApiKey()}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      console.log(`[deepseek:${callId}] ← ${response.status} (${Date.now()-t0}ms)`);

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new HTTPError(
          `DeepSeek API returned ${response.status}`,
          response.status,
          errBody.slice(0, 500)
        );
      }

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content || '';
      lastRawText = rawText;  // save for possible retry nudge

      if (!rawText.trim()) {
        // On last attempt, return graceful fallback instead of throwing
        if (attempt >= DEEPSEEK_MAX_RETRIES) {
          console.warn(`[deepseek:${callId}] All retries exhausted (empty content), returning fallback`);
          return {
            system_log: 'AI fallback',
            dj_speech: '让我为你选一首歌。',
            action_type: 'change_song',
            search_query: 'Chillwave instrumental',
            _meta: { model: data.model || model, usage: data.usage || null, attempts: attempt + 1, fallback: true },
          };
        }
        throw new EmptyResponseError('DeepSeek returned empty content');
      }

      // --- Extract & validate ---
      const parsed = extractJSON(rawText);
      const validated = validateResponse(parsed);

      // Track token usage
      if (data.usage?.total_tokens) {
        addDailyTokens(data.usage.total_tokens);
      }

      // Success!
      return {
        ...validated,
        _meta: {
          model: data.model || model,
          usage: data.usage || null,
          attempts: attempt + 1,
        },
      };
    } catch (err) {
      console.error(`[deepseek:${callId}] FAIL attempt=${attempt+1}: ${err.name}: ${err.message}`);
      if (err instanceof ConfigError || err instanceof SchemaError) throw err;
      lastError = err;

      // On last attempt, return graceful fallback instead of throwing
      if (attempt >= DEEPSEEK_MAX_RETRIES) {
        console.warn(`[deepseek:${callId}] All retries exhausted (${err.name}), returning fallback`);
        return {
          system_log: 'AI fallback',
          dj_speech: '让我为你选一首歌。',
          action_type: 'change_song',
          search_query: 'Chillwave instrumental',
          _meta: { model: data?.model || model, usage: data?.usage || null, attempts: attempt + 1, fallback: true },
        };
      }

      // Retry strategy depends on error type
      if (err instanceof EmptyResponseError) {
        // Empty response = model/backend issue, swap to pro model
        const fallbackModel = 'deepseek-v4-pro';
        if (body.model !== fallbackModel) {
          body.model = fallbackModel;
          console.log(`[deepseek:${callId}] Empty response → switching to ${fallbackModel}`);
        }
      } else if (lastRawText) {
        // Parse/Schema error: model produced content but not valid JSON. Nudge harder.
        body.messages.push({
          role: 'assistant',
          content: lastRawText.slice(0, 500),
        });
        body.messages.push({
          role: 'user',
          content: 'Your previous response was not valid JSON. Output ONLY the JSON object. No markdown. No explanation.',
        });
      }
    }
  }

  throw lastError || new Error('askDeepSeek failed after retries');
}

// ---------------------------------------------------------------------------
// Custom errors (callers can instanceof-check to decide how to handle)
// ---------------------------------------------------------------------------

class ParseError extends Error {
  constructor(message, preview) {
    super(message);
    this.name = 'ParseError';
    this.preview = preview;
  }
}

class SchemaError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'SchemaError';
    this.raw = raw;
  }
}

class HTTPError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'HTTPError';
    this.status = status;
    this.body = body;
  }
}

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

class EmptyResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmptyResponseError';
  }
}

// ---------------------------------------------------------------------------
module.exports = { askDeepSeek, extractJSON, validateResponse };
