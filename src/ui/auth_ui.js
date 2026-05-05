/**
 * AUTH_UI.JS — Netease QR Login UI
 *
 * Handles user badge, QR modal, and polling status updates.
 * Uses non-blocking IPC: main does single ops, renderer polls.
 */

// ── State ──
let _loginKey = null;
let _pollTimer = null;

// ── Init ──
async function initAuthUI() {
  const badge = $('#user-badge');
  console.log('[auth_ui] init, badge found:', !!badge);
  if (!badge) return;

  // Check saved cookie
  try {
    const result = await window.claudio.checkLogin();
    if (result?.loggedIn) {
      badge.classList.remove('guest');
      badge.title = '已登录网易云 — 点击重新登录';
      // Show nickname first 2 chars in LIVE text
      const liveText = badge.querySelector('.live-text');
      if (liveText && result.nickname) {
        liveText.textContent = result.nickname.slice(0, 2);
      }
    } else {
      badge.classList.add('guest');
    }
  } catch { badge.classList.add('guest'); }

  badge.addEventListener('click', () => {
    console.log('[auth_ui] 用户徽章被点击了');
    if (!_loginKey) startLogin();
  });

  const qrClose = $('#qr-close');
  if (qrClose) qrClose.addEventListener('click', cancelLogin);
  const overlay = $('#qr-overlay');
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cancelLogin();
  });
}

// ── Start login ──
async function startLogin() {
  console.log('[auth_ui] startLogin called');
  const overlay = $('#qr-overlay');
  const status = $('#qr-status');
  const img = $('#qr-image');

  overlay.classList.remove('hidden');
  img.src = '';
  status.textContent = '正在生成二维码...';
  status.style.color = '#69f0ae';

  try {
    // Step 1: get QR code (fast IPC, returns immediately)
    const qrResult = await window.claudio.getQrCode();
    if (!qrResult?.ok) throw new Error(qrResult?.error || 'QR generation failed');

    const qrData = qrResult.qrimg || '';
    console.log('二维码原始数据:', qrData.substring(0, 50));
    // Ensure base64 prefix — API may return raw base64 or prefixed
    img.src = qrData.startsWith('data:') ? qrData : 'data:image/png;base64,' + qrData;
    _loginKey = qrResult.key;
    status.textContent = '请使用网易云 APP 扫码';
    status.style.color = '#69f0ae';

    // Step 2: start polling every 2s
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(() => pollStatus(), 2000);

  } catch (e) {
    status.textContent = '生成二维码失败: ' + e.message;
    status.style.color = '#f44';
    setTimeout(cancelLogin, 3000);
  }
}

// ── Poll QR status ──
async function pollStatus() {
  if (!_loginKey) return;
  const status = $('#qr-status');

  try {
    const result = await window.claudio.checkQrStatus(_loginKey);
    if (!result) return;

    status.textContent = result.message || '';

    if (result.code === 802) {
      status.style.color = '#ffd54f'; // yellow
    } else if (result.code === 803) {
      // Success!
      status.style.color = '#69f0ae';
      status.textContent = '✅ 登录成功！';
      clearInterval(_pollTimer); _pollTimer = null;
      const badge = $('#user-badge');
      if (badge) { badge.classList.remove('guest'); }
      setTimeout(() => { $('#qr-overlay').classList.add('hidden'); _loginKey = null; }, 1500);
    } else if (result.code === 800) {
      status.style.color = '#f44';
      status.textContent = '二维码已过期，请关闭后重试';
      clearInterval(_pollTimer); _pollTimer = null;
    }
  } catch (e) {
    status.textContent = '检查状态出错，请重试';
    status.style.color = '#f44';
  }
}

function cancelLogin() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  _loginKey = null;
  $('#qr-overlay').classList.add('hidden');
  $('#qr-image').src = '';
}

// Self-executing init: handle case where DOMContentLoaded already fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthUI);
} else {
  initAuthUI();
}
