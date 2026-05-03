/**
 * Claudio.fm Desktop Player — Renderer (Cyberpunk Edition)
 */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ── State ──
let isPlaying = false;
let queue = [];
let currentQueueIdx = -1;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initWindowControls();
  initChat();
  initAudio();
  initQueue();
  initAI();
  initSettings();
  initSchedulerListener();
  initThemeToggle();
});

// ═══════════════════════════════════════════════════════
// CLOCK — Live pixel digital clock
// ═══════════════════════════════════════════════════════
function initClock() {
  const tick = () => {
    const now = new Date();
    $('#clock-time').textContent =
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    $('#clock-date').textContent =
      `${days[now.getDay()]} ${String(now.getDate()).padStart(2,'0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
  };
  tick();
  setInterval(tick, 1000);
}

// ═══════════════════════════════════════════════════════
// WINDOW CONTROLS
// ═══════════════════════════════════════════════════════
function initWindowControls() {
  $('#btn-min').addEventListener('click', () => window.claudio.minimize());
  $('#btn-max').addEventListener('click', () => window.claudio.maximize());
  $('#btn-close').addEventListener('click', () => window.claudio.close());
}

// ═══════════════════════════════════════════════════════
// CHAT — Glowing input → backend → UI update
// ═══════════════════════════════════════════════════════
function initChat() {
  const input = $('#chat-input');
  const btn = $('#btn-send');

  async function send() {
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    setInputDisabled(true);

    try {
      const res = await window.claudio.sendMessage(msg);
      if (!res.ok) throw new Error(res.error);
      handleDJResponse(res);
    } catch (err) {
      showAI('Connection failed. Check .env config.', err.message);
    } finally {
      setInputDisabled(false);
      input.focus();
    }
  }

  btn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });

  // Mic button — placeholder for voice input
  $('#btn-mic').addEventListener('click', () => {
    showAI('Voice input not yet available', '语音输入暂未接入 — 即将支持');
  });
}

function setInputDisabled(disabled) {
  $('#chat-input').disabled = disabled;
  $('#btn-send').disabled = disabled;
}

// ═══════════════════════════════════════════════════════
// DJ RESPONSE — Route to AI bubble, queue, player, audio
// ═══════════════════════════════════════════════════════
function handleDJResponse(data) {
  // AI speech bubble (say = EN, reason = ZH subtitle)
  if (data.say) showAI(data.say, data.reason || '');

  // Queue: build from tracks array (resolved) or play[] (unresolved names)
  if (data.tracks?.length) {
    queue = data.tracks;
    currentQueueIdx = 0;
    renderQueue();
  } else if (data.play?.length) {
    queue = data.play.map(name => ({ label: name, name }));
    currentQueueIdx = 0;
    renderQueue();
  }

  // Player info
  if (data.tracks?.length) {
    const t = data.tracks[0];
    updatePlayerInfo(t.label || t.name, t.album || 'RESOLVED');
  } else if (data.play?.length) {
    updatePlayerInfo(data.play[0], 'SEARCHING...');
  }

  // Audio
  if (data.tracks?.[0]?.url) {
    playAudio(data.tracks[0].url);
  }
}

// ═══════════════════════════════════════════════════════
// AI SPEECH BUBBLE
// ═══════════════════════════════════════════════════════
function showAI(textEn, textZh) {
  $('#ai-en').textContent = textEn || '';
  $('#ai-zh').textContent = textZh || '';
  const now = new Date();
  $('#ai-time').textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function initAI() {
  showAI(
    "Claudio.fm is online. I'm your personal AI radio DJ — ask me to play anything.",
    '你的个人 AI 电台已上线，随时为你播放'
  );
}

// ═══════════════════════════════════════════════════════
// PLAYER INFO
// ═══════════════════════════════════════════════════════
function updatePlayerInfo(title, sub) {
  $('#np-title').textContent = title || 'Claudio.fm';
  $('#np-artist').textContent = sub || '';
}

// ═══════════════════════════════════════════════════════
// QUEUE — Track list with current-song highlight
// ═══════════════════════════════════════════════════════
function initQueue() { renderQueue(); }

function renderQueue() {
  const container = $('#queue-list');
  const count = $('#queue-count');
  count.textContent = `${queue.length} TRACKS`;

  if (!queue.length) {
    container.innerHTML = '<div class="queue-empty">— QUEUE EMPTY —</div>';
    return;
  }

  container.innerHTML = queue.map((t, i) => {
    const active = i === currentQueueIdx;
    const cls = active ? 'queue-track active' : 'queue-track';
    const dot = active ? '<span class="dot-pulse green sm" style="margin-right:6px"></span>' : '';
    const title = t.label || t.name || t.title || '?';
    const artist = t.artist || t.album || t.sub || '';

    return `
      <div class="${cls}">
        <span class="queue-idx">${String(i + 1).padStart(2, '0')}</span>
        <div class="queue-body">
          <div class="qt-title">${dot}${esc(title)}</div>
          ${artist ? `<div class="qt-artist">${esc(artist)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ═══════════════════════════════════════════════════════
// AUDIO — Playback + progress bar
// ═══════════════════════════════════════════════════════
function initAudio() {
  const audio = $('#audio');

  $('#btn-play').addEventListener('click', () => {
    if (audio.src && !audio.src.endsWith('null')) {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    }
  });
  $('#btn-play').disabled = false;

  audio.addEventListener('play', () => {
    isPlaying = true;
    $('#icon-play').style.display = 'none';
    $('#icon-pause').style.display = '';
    $('#btn-play').classList.add('active');
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    $('#icon-play').style.display = '';
    $('#icon-pause').style.display = 'none';
    $('#btn-play').classList.remove('active');
  });

  audio.addEventListener('ended', () => {
    isPlaying = false;
    $('#icon-play').style.display = '';
    $('#icon-pause').style.display = 'none';
  });

  audio.addEventListener('error', () => {
    showAI('Audio load failed — track may be VIP-only.', null);
    $('#progress-fill').style.width = '0%';
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration && isFinite(audio.duration)) {
      const pct = (audio.currentTime / audio.duration) * 100;
      $('#progress-fill').style.width = `${pct}%`;
      $('#time-now').textContent = fmtTime(audio.currentTime);
      $('#time-total').textContent = fmtTime(audio.duration);
    }
  });
}

function playAudio(url) {
  const audio = $('#audio');
  audio.src = url;
  audio.play().catch(err => console.error('[audio] Play failed:', err));
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ═══════════════════════════════════════════════════════
// THEME TOGGLE — DARK / LIGHT (invert)
// ═══════════════════════════════════════════════════════
function initThemeToggle() {
  let dark = true;
  $('#btn-theme').addEventListener('click', () => {
    dark = !dark;
    const btn = $('#btn-theme');
    btn.textContent = dark ? 'DARK' : 'LIGHT';
    document.body.style.filter = dark ? 'none' : 'invert(0.9) hue-rotate(180deg)';
  });
}

// ═══════════════════════════════════════════════════════
// SETTINGS — Model switcher overlay
// ═══════════════════════════════════════════════════════
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
      $('#model-note').textContent = `CURRENT: ${settings.model}`;
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
      $('#model-note').textContent = `SWITCHED: ${model}`;
    } catch {
      $('#model-note').textContent = 'SWITCH FAILED';
    }
  });
}

// ═══════════════════════════════════════════════════════
// SCHEDULER — Auto broadcasts from backend cron
// ═══════════════════════════════════════════════════════
function initSchedulerListener() {
  if (!window.claudio.onBroadcast) return;
  window.claudio.onBroadcast((data) => {
    handleDJResponse(data);
  });
}
