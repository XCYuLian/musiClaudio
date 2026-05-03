/**
 * Claudio Desktop Player — Renderer
 */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ── State ──
let isPlaying = false;
let currentTrack = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initWindowControls();
  initChat();
  initAudio();
  initSettings();
  initSchedulerListener();
});

// ── Window Controls ──
function initWindowControls() {
  $('#btn-min').addEventListener('click', () => window.claudio.minimize());
  $('#btn-max').addEventListener('click', () => window.claudio.maximize());
  $('#btn-close').addEventListener('click', () => window.claudio.close());
}

// ── Chat ──
function initChat() {
  const input = $('#chat-input');
  const btn = $('#btn-send');

  async function send() {
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    input.disabled = btn.disabled = true;
    showDJMessage('…', null);

    try {
      const res = await window.claudio.sendMessage(msg);
      if (!res.ok) throw new Error(res.error);
      handleDJResponse(res);
    } catch (err) {
      showDJMessage('抱歉，连接失败。请确认 .env 配置正确。', err.message);
    } finally {
      input.disabled = btn.disabled = false;
      input.focus();
    }
  }

  btn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
}

// ── Handle DJ Response ──
function handleDJResponse(data) {
  if (data.say) showDJMessage(data.say, data.reason);

  // Update track info
  if (data.tracks?.length) {
    const t = data.tracks[0];
    updateTrackInfo(t.label || t.name, t.album || '', true);
  } else if (data.play?.length) {
    updateTrackInfo(data.play[0], data.reason || '', false);
  }

  // Play audio if resolved
  if (data.tracks?.[0]?.url) {
    playAudio(data.tracks[0].url);
  }
}

function showDJMessage(say, reason) {
  const el = $('#dj-msg');
  el.classList.remove('hidden');
  $('#dj-say').textContent = say;
  if (reason) {
    $('#dj-reason').textContent = reason;
    $('#dj-reason').style.display = '';
  } else {
    $('#dj-reason').style.display = 'none';
  }
}

function updateTrackInfo(title, sub, resolved) {
  $('#track-title').textContent = title || 'Claudio';
  $('#track-sub').textContent = sub || (resolved ? '已解析 — 开始播放' : '等待网易云解析…');
}

// ── Audio ──
function initAudio() {
  const audio = $('#audio');
  const artwork = $('#artwork');

  $('#btn-play').addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  $('#btn-play').disabled = false;

  audio.addEventListener('play', () => {
    isPlaying = true;
    artwork.classList.add('playing');
    $('#icon-play').style.display = 'none';
    $('#icon-pause').style.display = '';
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    artwork.classList.remove('playing');
    $('#icon-play').style.display = '';
    $('#icon-pause').style.display = 'none';
  });

  audio.addEventListener('ended', () => {
    isPlaying = false;
    artwork.classList.remove('playing');
    $('#icon-play').style.display = '';
    $('#icon-pause').style.display = 'none';
  });

  audio.addEventListener('error', () => {
    showDJMessage('音频加载失败，可能该歌曲需要 VIP。', null);
  });
}

function playAudio(url) {
  const audio = $('#audio');
  audio.src = url;
  audio.play().catch((err) => {
    console.error('[audio] Play failed:', err);
  });
}

// ── Settings ──
async function initSettings() {
  const gearBtn = $('#btn-settings');
  const overlay = $('#settings-overlay');
  const closeBtn = $('#btn-settings-close');
  const modelSelect = $('#model-select');

  gearBtn.addEventListener('click', async () => {
    overlay.classList.remove('hidden');
    try {
      const settings = await window.claudio.getSettings();
      modelSelect.innerHTML = '';
      settings.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        if (m.id === settings.model) opt.selected = true;
        modelSelect.appendChild(opt);
      });
      $('#model-note').textContent = `当前：${settings.model}`;
    } catch { /* ignore */ }
  });

  closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });

  modelSelect.addEventListener('change', async () => {
    const model = modelSelect.value;
    try {
      await window.claudio.setModel(model);
      $('#model-note').textContent = `已切换至 ${model}`;
    } catch {
      $('#model-note').textContent = '切换失败';
    }
  });
}

// ── Scheduler Broadcasts ──
function initSchedulerListener() {
  if (!window.claudio.onBroadcast) return;
  window.claudio.onBroadcast((data) => {
    handleDJResponse(data);
  });
}
