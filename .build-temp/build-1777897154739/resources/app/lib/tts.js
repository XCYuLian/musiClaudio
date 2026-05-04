/**
 * TTS.JS — Built-in Speech Synthesis (Chromium/Electron)
 *
 * Uses the renderer's window.speechSynthesis API (free, no key, no network).
 * This module provides a stub — the actual speaking happens in player.js
 * via speakText() which uses the browser's built-in TTS engine.
 *
 * The renderer handles TTS directly:
 *   const u = new SpeechSynthesisUtterance(text);
 *   u.lang = 'zh-CN'; u.rate = 0.95;
 *   speechSynthesis.speak(u);
 */

// No-op — TTS is handled entirely in the renderer via browser SpeechSynthesis API.
// This module exists for backward compatibility with scheduler.js imports.

async function synthesize(text) {
  // TTS is handled client-side by the renderer.
  // Return null to indicate no server-side audio file.
  // The scheduler broadcasts the text, and the renderer speaks it.
  return null;
}

async function synthesizeBatch(segments) {
  return Promise.all(segments.map(() => null));
}

module.exports = { synthesize, synthesizeBatch };
