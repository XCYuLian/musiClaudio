/**
 * Claudio PWA — Client App
 *
 * Views: Player / Profile / Settings
 * Comms: WebSocket /stream + REST API fallback
 */

// ── DOM refs ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── State ──
let ws = null;
let reconnectTimer = null;
let currentView = 'player';

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initWS();
  initChat();
  initAudioControls();
  initSettings();
  if ('serviceWorker' in navigator) registerSW();
});

// ── Navigation ──
function initNav() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  currentView = view;
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
  $(`.nav-btn[data-view="${view}"]`).classList.add('active');

  if (view === 'profile') loadProfile();
  if (view === 'settings') loadSettings();
}

// ── WebSocket ──
function initWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/stream`;

  ws = new WebSocket(url);
  ws.onopen = () => {
    updateStatus('ws', '已连接');
    clearTimeout(reconnectTimer);
  };
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    handleWSMessage(data);
  };
  ws.onclose = () => {
    updateStatus('ws', '断开 — 3s 后重连');
    reconnectTimer = setTimeout(initWS, 3000);
  };
  ws.onerror = () => {
    updateStatus('ws', '连接错误');
  };
}

function handleWSMessage(data) {
  switch (data.type) {
    case 'connected':
      console.log('[ws]', data.message);
      break;
    case 'scheduled':
    case 'llm':
    case 'direct':
      console.log('[ws] DJ response:', data);
      if (data.say) showDJMessage(data.say, data.reason);
      if (data.tts) playAudio(data.tts);
      if (data.play) updateNowPlaying(data.play[0]);
      break;
    default:
      console.log('[ws] Unknown message:', data);
  }
}

function updateStatus(id, text) {
  const el = $(`#status-${id}`);
  if (el) el.textContent = text;
}

// ── Chat ──
function initChat() {
  const input = $('#chat-input');
  const btn = $('#btn-send');

  async function send() {
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    showDJMessage('…', null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (data.say) showDJMessage(data.say, data.reason);
      if (data.tts) playAudio(data.tts);
      if (data.play) updateNowPlaying(data.play[0]);
    } catch (err) {
      showDJMessage('抱歉，Claudio 暂时无法连接。请检查服务是否启动。', '连接错误');
    }
  }

  btn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
}

// ── Audio ──
function initAudioControls() {
  const audio = $('#audio');
  $('#btn-play').addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  $('#btn-play').disabled = false;

  audio.addEventListener('play', () => { $('#btn-play').textContent = '⏸'; });
  audio.addEventListener('pause', () => { $('#btn-play').textContent = '▶'; });
}

function playAudio(url) {
  const audio = $('#audio');
  audio.src = url;
  audio.play().catch(() => {});
}

function updateNowPlaying(track) {
  if (track) $('#track-title').textContent = track;
}

function showDJMessage(say, reason) {
  const el = $('#dj-message');
  let html = `<p class="say">${escapeHTML(say)}</p>`;
  if (reason) html += `<p class="reason">${escapeHTML(reason)}</p>`;
  el.innerHTML = html;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Profile ──
async function loadProfile() {
  try {
    const res = await fetch('/api/taste');
    const data = await res.json();
    const files = data.files || {};
    let html = '';
    for (const [name, content] of Object.entries(files)) {
      html += `<details><summary>${escapeHTML(name)}</summary><pre>${escapeHTML(content)}</pre></details>`;
    }
    $('#profile-content').innerHTML = html || '暂无数据。请在 user/ 目录创建品味文件。';
  } catch {
    $('#profile-content').textContent = '无法加载画像数据。';
  }
}

// ── Settings ──
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();

    // Model selector
    const select = $('#model-select');
    select.innerHTML = '';
    (data.availableModels || []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label;
      if (m.id === data.model) opt.selected = true;
      select.appendChild(opt);
    });
    $('#model-hint').textContent = `当前：${data.model}`;

    // Service statuses
    if (data.services) {
      updateStatus('netease', data.services.ncm ? '已连接' : '未连接');
      updateStatus('scheduler', data.services.scheduler ? '运行中' : '异常');
    }
  } catch {
    updateStatus('netease', '异常');
    updateStatus('scheduler', '异常');
  }
}

function initSettings() {
  const select = $('#model-select');
  if (!select) return;
  select.addEventListener('change', async () => {
    const model = select.value;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      if (data.ok) {
        $('#model-hint').textContent = `已切换至 ${model} ✓`;
      }
    } catch (err) {
      $('#model-hint').textContent = '切换失败，请重试';
    }
  });
}

// ── Service Worker ──
function registerSW() {
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.log('[sw] Registration failed:', err);
  });
}

// ── Helpers ──
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
