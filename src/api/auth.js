/**
 * AUTH.JS — Netease Cloud Music QR Code Login
 *
 * Based on NeteaseCloudMusicApi module.
 * Provides: get QR code → poll status → persist cookie to SQLite.
 *
 * Flow:
 *   1. getLoginQrCode()      → { key, qrimg }   (base64 PNG)
 *   2. checkQrStatus(key)    → { code, cookie, message }
 *   3. saveCookie(cookie)    → state.setPref('netease_cookie', cookie)
 *
 * Status codes:
 *   800 — QR code expired
 *   801 — Waiting for scan
 *   802 — Scanned, waiting for user confirmation
 *   803 — Login authorized (cookie available)
 */

const ncmModule = (() => {
  try { return require('NeteaseCloudMusicApi'); } catch { return null; }
})();

// ── QR Code ──

/**
 * Generate QR code for Netease login.
 * @returns {Promise<{key: string, qrimg: string}>} key + base64 QR image
 */
async function getLoginQrCode() {
  if (!ncmModule) throw new Error('NeteaseCloudMusicApi not installed');

  // Step 1: get unikey
  const keyRes = await ncmModule.login_qr_key({});
  if (!keyRes.body?.data?.unikey) {
    throw new Error('Failed to get QR key: ' + JSON.stringify(keyRes.body));
  }
  const key = keyRes.body.data.unikey;

  // Step 2: create QR with base64 image
  const qrRes = await ncmModule.login_qr_create({ key, qrimg: true });
  if (!qrRes.body?.data?.qrimg) {
    throw new Error('Failed to create QR: ' + JSON.stringify(qrRes.body));
  }

  return { key, qrimg: qrRes.body.data.qrimg };
}

// ── Status polling ──

/**
 * Check QR code scan status.
 * @param {string} key — unikey from getLoginQrCode()
 * @returns {Promise<{code: number, cookie?: string, message: string}>}
 */
async function checkQrStatus(key) {
  if (!ncmModule) throw new Error('NeteaseCloudMusicApi not installed');

  const res = await ncmModule.login_qr_check({ key });
  const body = res.body || {};

  const code = body.code || 0;
  const messages = {
    800: 'QR code expired. Please refresh.',
    801: 'Waiting for scan...',
    802: 'Scanned! Please confirm on your phone.',
    803: 'Login authorized successfully.',
  };

  const result = { code, message: messages[code] || `Unknown status: ${code}` };

  // 803: authorization success — extract cookie
  if (code === 803 && body.cookie) {
    result.cookie = body.cookie;
  }

  return result;
}

// ── Cookie persistence ──

/**
 * Save login cookie to SQLite via state module.
 * @param {string} cookie — Netease MUSIC_U cookie string
 */
function saveCookie(cookie) {
  if (!cookie) return false;
  try {
    const state = require('../core/state');
    state.setPref('netease_cookie', cookie);
    console.log('[auth] Cookie saved to state');
    return true;
  } catch (e) {
    console.error('[auth] Failed to save cookie:', e.message);
    return false;
  }
}

// ── Convenience: full login flow with polling ──

/**
 * Full login flow: get QR → poll until done/expired.
 * @param {Function} onUpdate — callback({code, message, qrimg?}) for UI updates
 * @param {number} [intervalMs=2000] — poll interval
 * @param {number} [timeoutMs=300000] — total timeout (5 min)
 * @returns {Promise<{success: boolean, cookie?: string}>}
 */
async function loginWithQr(onUpdate, intervalMs = 2000, timeoutMs = 300000) {
  // Step 1: Get QR code
  let qr;
  try {
    qr = await getLoginQrCode();
    if (onUpdate) onUpdate({ code: 801, message: '等待扫码', qrimg: qr.qrimg });
  } catch (e) {
    if (onUpdate) onUpdate({ code: -1, message: e.message });
    return { success: false };
  }

  // Step 2: Poll status
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs));

    let status;
    try {
      status = await checkQrStatus(qr.key);
    } catch (e) {
      if (onUpdate) onUpdate({ code: -1, message: e.message });
      continue;
    }

    if (onUpdate) onUpdate(status);

    if (status.code === 803) {
      // Success — persist cookie
      saveCookie(status.cookie);
      return { success: true, cookie: status.cookie };
    }

    if (status.code === 800) {
      // Expired
      return { success: false };
    }
  }

  return { success: false };
}

module.exports = { getLoginQrCode, checkQrStatus, saveCookie, loginWithQr };
