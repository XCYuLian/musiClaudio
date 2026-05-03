/**
 * CLAUDE.JS — DeepSeek Adapter (replaces the Claude CLI spinner)
 *
 * Responsibilities:
 * 1. Send assembled prompts to the DeepSeek API (OpenAI-compatible)
 * 2. Enforce STRICT JSON output → strip markdown fences, extract object
 * 3. Validate returned JSON matches the {say, play[], reason, segue} schema
 * 4. Surface actionable errors (HTTP, parse, schema) without crashing the caller
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

/** Read API key from env each call (supports runtime changes via settings UI) */
function getApiKey() {
  return process.env.DEEPSEEK_API_KEY || '';
}

// Required fields in the DJ response (new dual-track format)
const REQUIRED_FIELDS = ['reply', 'monologue', 'play', 'reason', 'segue'];
// Backward-compat: old format had 'say' instead of 'monologue'
const LEGACY_SAY_FIELDS = ['say', 'play', 'reason', 'segue'];

// Max retries on extraction/parse failure (model sometimes needs a second chance)
const MAX_RETRIES = 2;

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
  // New format: reply + monologue
  if (typeof obj.reply === 'string' && typeof obj.monologue === 'string') return true;
  // Legacy format: say
  if (typeof obj.say === 'string') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Schema validation (dual-track: reply + monologue)
// ---------------------------------------------------------------------------

function validateResponse(obj) {
  // Backward-compat: if 'say' is present but 'monologue' isn't, map say→monologue
  if (obj.say && !obj.monologue) {
    obj.monologue = obj.say;
    delete obj.say;
  }
  // Ensure both fields exist
  if (obj.reply === undefined) obj.reply = '';
  if (obj.monologue === undefined) obj.monologue = '';

  // Validate types
  if (typeof obj.reply !== 'string') {
    throw new SchemaError('Field "reply" must be a string', obj);
  }
  if (typeof obj.monologue !== 'string') {
    throw new SchemaError('Field "monologue" must be a string', obj);
  }
  // At least one of reply or monologue must have content
  if (!(obj.reply || '').trim() && !(obj.monologue || '').trim()) {
    throw new SchemaError('At least one of "reply" or "monologue" must be non-empty', obj);
  }
  if (!Array.isArray(obj.play)) {
    throw new SchemaError('Field "play" must be an array', obj);
  }
  if (obj.play.length > 10) {
    throw new SchemaError('Field "play" must contain at most 10 items', obj);
  }
  if (typeof obj.reason !== 'string') {
    throw new SchemaError('Field "reason" must be a string', obj);
  }
  if (typeof obj.segue !== 'string') {
    throw new SchemaError('Field "segue" must be a string', obj);
  }

  // Normalize (dual-track: reply + monologue)
  return {
    reply:     (obj.reply    || '').trim(),
    monologue: (obj.monologue || '').trim(),
    play:      (obj.play     || []).map(s => String(s || '').trim()).filter(Boolean),
    reason:    (obj.reason   || '').trim(),
    segue:     (obj.segue    || '').trim(),
  };
}

// ---------------------------------------------------------------------------
// Core: send prompt to DeepSeek, get parsed DJ response
// ---------------------------------------------------------------------------

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
    maxTokens = 4096,
  } = options;

  // Resolve model: explicit override > state prefs > env default
  let model = options.model || DEEPSEEK_MODEL;
  try {
    const state = require('./state');
    const pref = state.getPref('model');
    if (pref && !options.model) model = pref;
  } catch { /* state not initialized yet, use env default */ }

  if (!getApiKey()) {
    throw new ConfigError('DEEPSEEK_API_KEY is not set. Set it in Settings or .env file.');
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // --- HTTP call ---
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify(body),
      });

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

      if (!rawText.trim()) {
        throw new EmptyResponseError('DeepSeek returned empty content');
      }

      // --- Extract & validate ---
      const parsed = extractJSON(rawText);
      const validated = validateResponse(parsed);

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
      // Don't retry on config/schema errors — only on extraction/HTTP
      if (err instanceof ConfigError || err instanceof SchemaError) throw err;
      lastError = err;

      if (attempt < MAX_RETRIES) {
        // Nudge the model harder on retry: prepend a JSON-only reminder
        body.messages.push({
          role: 'assistant',
          content: body.messages[body.messages.length - 1]?.content || '',
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
