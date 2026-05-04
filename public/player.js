/**
 * Claudio.fm Desktop Player — Renderer (Cyberpunk Edition)
 */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ── State ──
let isPlaying = false;
let queue = [];
let currentQueueIdx = -1;
let playerState = 'idle';   // 'idle' | 'ready' | 'playing'
let dark = true;
let lang = localStorage.getItem('claudio_lang') || 'en';
let chatMessages = [];
let playHistory = JSON.parse(localStorage.getItem('claudio_history') || '[]');

function fmtNow() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// ── i18n ──
const T = {
  en: {
    settings: 'SET', onAir: 'ON AIR',
    playing: 'PLAYING', ready: 'READY', idle: 'IDLE',
    queue: 'QUEUE', tracks: 'TRACKS', queueEmpty: '— QUEUE EMPTY —',
    queueEmptyHint: 'Import your playlist in Settings →',
    aiBadge: 'Claudio', aiPlaying: 'ONLINE',
    aiWelcome: "Claudio.fm is online. I'm your personal AI radio DJ — ask me to play anything.",
    aiWelcomeZh: '你的个人 AI 电台已上线，随时为你播放',
    inputPlaceholder: 'Say something to Claudio...',
    footerConnected: 'CONNECTED',
    settingsTitle: '— SETTINGS —', modelLabel: 'MODEL',
    modelCurrent: 'CURRENT:', modelSwitched: 'SWITCHED:', modelSwitchFail: 'SWITCH FAILED',
    apiKeyLabel: 'API KEY', saveKey: 'SAVE KEY', savingKey: 'SAVING...',
    keySaved: '•••••••• (saved)', keyInvalid: 'Enter a valid API key',
    importPlaceholder: 'NetEase UID or playlist link',
    importInvalid: 'Enter a valid UID or playlist link',
    parseError: 'Cannot parse this link',
    noPlaylists: 'No playlists found for this account',
    neteaseLabel: 'NETEASE IMPORT', importBtn: 'IMPORT PLAYLISTS',
    importing: 'IMPORTING...', closeBtn: 'CLOSE',
    enterUid: 'Please enter your Netease User ID', connecting: 'Connecting...',
    importDone: (n, p) => `${n} tracks in ${p} playlists imported.`,
    audioError: 'Audio load failed — track may be VIP-only.',
    connError: 'Connection failed. Check .env config.',
    voiceNA: 'Voice input not yet available', voiceNAZh: '语音输入暂未接入 — 即将支持',
    searching: 'SEARCHING...', resolved: 'RESOLVED', unavailable: 'UNAVAILABLE',
    themeDark: 'DARK', themeLight: 'LIGHT',
    days: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    months: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
  },
  zh: {
    settings: '设置', onAir: '直播中',
    playing: '播放中', ready: '就绪', idle: '待机',
    queue: '队列', tracks: '首', queueEmpty: '— 队列为空 —',
    queueEmptyHint: '在设置中导入你的网易云歌单 →',
    aiBadge: 'Claudio', aiPlaying: '在线',
    aiWelcome: 'Claudio.fm 已上线。我是你的私人 AI 电台 DJ —— 想听什么，跟我说。',
    aiWelcomeZh: '你的个人 AI 电台已上线，随时为你播放',
    inputPlaceholder: '对 Claudio 说点什么...',
    footerConnected: '已连接',
    settingsTitle: '— 设置 —', modelLabel: '模型',
    modelCurrent: '当前：', modelSwitched: '已切换：', modelSwitchFail: '切换失败',
    apiKeyLabel: 'API 密钥', saveKey: '保存密钥', savingKey: '保存中...',
    keySaved: '•••••••• (已保存)', keyInvalid: '请输入有效的 API 密钥',
    importPlaceholder: '输入网易云 UID 或歌单链接',
    importInvalid: '请输入有效的 UID 或歌单链接',
    parseError: '无法解析此链接',
    noPlaylists: '该账号未找到公开歌单',
    neteaseLabel: '网易云导入', importBtn: '导入歌单',
    importing: '导入中...', closeBtn: '关闭',
    enterUid: '请输入网易云用户 ID', connecting: '连接中...',
    importDone: (n, p) => `已导入 ${n} 首，共 ${p} 个歌单。`,
    audioError: '音频加载失败 —— 可能为 VIP 限定曲目。',
    connError: '连接失败，请检查 .env 配置。',
    voiceNA: '语音输入暂未接入', voiceNAZh: '语音输入暂未接入 — 即将支持',
    searching: '搜索中...', resolved: '已解析', unavailable: '无法获取播放源',
    themeDark: '暗黑', themeLight: '浅色',
    days: ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'],
    months: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  }
};

function t(key, ...args) {
  const str = T[lang]?.[key] || T.en[key] || key;
  return typeof str === 'function' ? str(...args) : str;
}

function applyLanguage() {
  // data-i18n inline spans (mixed text+children)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (T[lang][key]) el.textContent = T[lang][key];
  });
  // Static standalone text
  document.querySelector('.section-title').textContent = t('queue');
  document.querySelector('.settings-panel h3').textContent = t('settingsTitle');
  const secLabels = document.querySelectorAll('.settings-panel .section-label');
  // Order in settings: API KEY, MODEL, NETEASE IMPORT
  if (secLabels[0]) secLabels[0].textContent = t('apiKeyLabel');
  if (secLabels[1]) secLabels[1].textContent = t('modelLabel');
  if (secLabels[2]) secLabels[2].textContent = t('neteaseLabel');
  // Buttons
  $('#btn-save-key').textContent = t('saveKey');
  $('#btn-import').textContent = t('importBtn');
  $('#btn-settings-close').textContent = t('closeBtn');
  $('#btn-settings').textContent = t('settings');
  // Input placeholders
  $('#chat-input').placeholder = t('inputPlaceholder');
  $('#import-input').placeholder = t('importPlaceholder');
  // Theme & lang buttons
  $('#btn-theme').textContent = dark ? t('themeDark') : t('themeLight');
  $('#btn-lang').textContent = lang === 'en' ? '中文' : 'EN';
  // Dynamic re-renders
  setPlayerState(playerState);
  renderQueue();
  renderChat();
  renderHistory();
  renderFavs();
  updateClock();
}

// ═══════════════════════════════════════════════════════
// LOGIN — Intercept before main UI
// ═══════════════════════════════════════════════════════
function initLogin() {
  const overlay = $('#login-overlay');
  const input = $('#login-uid');
  const btn = $('#btn-login');
  const note = $('#login-note');
  const btnSkip = $('#btn-login-skip');
  const btnGuide = $('#btn-login-guide');

  // Default key is built-in — always go straight to main UI
  overlay.classList.add('hidden');
  return false;

  // Login is now optional; user can trigger it from Settings → import

  // Window controls on login screen
  $('#login-btn-min').addEventListener('click', () => window.claudio.minimize());
  $('#login-btn-close').addEventListener('click', () => window.claudio.close());
  btnSkip.addEventListener('click', () => overlay.classList.add('hidden'));
  btnGuide.addEventListener('click', () => {
    const tip = $('#login-guide-tip');
    tip.style.display = tip.style.display === 'none' ? 'block' : 'none';
  });

  btn.addEventListener('click', async () => {
    const uid = input.value.trim();
    if (!uid || !/^\d+$/.test(uid)) {
      note.textContent = '请输入有效的网易云用户 ID（纯数字）';
      return;
    }
    btn.disabled = true; btn.textContent = '导入中...'; note.textContent = '';
    try {
      localStorage.setItem('user_uid', uid);
      const result = await window.claudio.importNetease(uid, '');
      if (result.ok) {
        note.style.color = '#69f0ae';
        note.textContent = `已导入 ${result.totalTracks} 首歌曲`;
        setTimeout(() => overlay.classList.add('hidden'), 1000);
      } else {
        note.style.color = '#ff6666';
        note.textContent = result.error || '导入失败';
        btn.disabled = false; btn.textContent = '重试';
      }
    } catch (err) {
      note.textContent = '连接失败：' + err.message;
      btn.disabled = false; btn.textContent = '重试';
    }
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
}

// ── Responsive resize ──
function initResize() {
  const update = () => {
    const h = window.innerHeight;
    // AI chat minimum visibility
    const aiChat = $('#ai-chat');
    if (aiChat) aiChat.style.minHeight = h < 600 ? '120px' : 'auto';
  };
  window.addEventListener('resize', update);
  update();
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  const loginShown = initLogin();
  initClock();
  initWindowControls();
  initChat();
  initAudio();
  initVolume();
  initQueue();
  initAI();
  initSettings();
  initSchedulerListener();
  initThemeToggle();
  initLangToggle();
  applyLanguage();
  initResize();

  if (!loginShown) {
    // Resume last playback
    setTimeout(loadPlaybackState, 800);
    // Load saved playlist
    setTimeout(loadSavedPlaylist, 1200);
  }
});

// ═══════════════════════════════════════════════════════
// CLOCK — Live digital, language-aware date format
// ═══════════════════════════════════════════════════════
function updateClock() {
  const now = new Date();
  $('#clock-time').textContent =
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const days = t('days');
  const months = t('months');
  if (lang === 'zh') {
    $('#clock-date').textContent =
      `${now.getFullYear()}年${months[now.getMonth()]}${now.getDate()}日 ${days[now.getDay()]}`;
  } else {
    $('#clock-date').textContent =
      `${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }
}

function initClock() {
  updateClock();
  setInterval(updateClock, 1000);
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
// PLAYER STATE — idle / ready / playing
// ═══════════════════════════════════════════════════════
function setPlayerState(state) {
  playerState = state;
  const label = $('#np-label-text');
  const playBtn = $('#btn-play');
  if (label) label.textContent = t(state);
  playBtn.disabled = (state === 'idle');
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
    // Add user message to chat history
    chatMessages.push({ role: 'user', content: msg, time: fmtNow() });
    renderChat();

    try {
      const res = await window.claudio.sendMessage(msg);
      if (!res.ok) throw new Error(res.error);
      handleDJResponse(res);
    } catch (err) {
      showAI(t('connError'), err.message);
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
    showAI(t('voiceNA'), t('voiceNAZh'));
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
  const hasTracks = data.tracks?.length > 0;
  const hasPlay = data.play?.length > 0;

  // Dual-track: reply (direct answer) + monologue (DJ broadcast)
  const reply = data.reply || data.say || '';
  const monologue = data.monologue || (data.reply ? '' : data.say) || '';
  const reason = data.reason || '';

  if (reply) {
    chatMessages.push({
      role: 'assistant', say: reply, reason: '',
      time: fmtNow(), hasTracks: false, isReply: true,
    });
  }
  if (monologue) {
    chatMessages.push({
      role: 'assistant', say: monologue, reason,
      time: fmtNow(), hasTracks,
    });
  }
  renderChat();

  // Queue logic: replace if music intent, append if question/chat
  const isQuestion = !!reply;
  const isAuto = data.type === 'scheduled' || data.type === 'system' || data.trigger === 'startup';
  const shouldAppend = (isQuestion || isAuto) && queue.length > 0;
  if (hasTracks) {
    if (shouldAppend) {
      queue = [...queue, ...data.tracks];
    } else {
      queue = data.tracks;
      currentQueueIdx = 0;
    }
    renderQueue();
  } else if (hasPlay) {
    if (shouldAppend) {
      queue = [...queue, ...data.play.map(name => ({ label: name, name }))];
    } else {
      queue = data.play.map(name => ({ label: name, name }));
      currentQueueIdx = 0;
    }
    renderQueue();
  }

  // Player — only auto-play if user explicitly requested music
  if (!shouldAppend && hasTracks) {
    const tr = data.tracks[0];
    updatePlayerInfo(tr.label || tr.name, tr.album || '');
    if (tr.url) {
      playAudio(tr.url);
    } else {
      setPlayerState('idle');
    }
  } else if (!shouldAppend && hasPlay) {
    updatePlayerInfo(data.play[0], t('unavailable'));
    setPlayerState('idle');
  }
}

// ═══════════════════════════════════════════════════════
// CHAT HISTORY — scrollable message bubbles
// ═══════════════════════════════════════════════════════
function renderChat() {
  const container = $('#ai-chat');
  if (!chatMessages.length) {
    container.innerHTML = `<div class="chat-msg assistant">
      <div class="msg-avatar">♪</div>
      <div class="msg-bubble">
        <div class="ai-en">${esc(t('aiWelcome'))}</div>
        <div class="ai-zh">${esc(t('aiWelcomeZh'))}</div>
      </div>
    </div>`;
    return;
  }
  container.innerHTML = chatMessages.map(msg => {
    if (msg.role === 'user') {
      return `<div class="chat-msg user">
        <div class="msg-bubble">${esc(msg.content)}</div>
        <div class="msg-meta"><span class="msg-time">${msg.time}</span></div>
      </div>`;
    }
    // Assistant: reply (direct answer) vs monologue (DJ broadcast)
    const cls = msg.isReply ? 'reply' : 'assistant';
    const avatar = msg.isReply ? '' : '<div class="msg-avatar">♪</div>';
    const meta = msg.isReply
      ? `<div class="msg-meta"><span class="msg-time">${msg.time}</span></div>`
      : `<div class="msg-meta">
          <span class="msg-time">${msg.time}</span>
          ${msg.hasTracks ? '<span class="msg-badge">♪ TRACKS</span>' : ''}
        </div>`;
    return `<div class="chat-msg ${cls}">
      ${avatar}
      <div class="msg-bubble ${msg.isReply ? 'reply-bubble' : ''}">
        <div class="ai-en">${esc(msg.say || '')}</div>
        ${msg.reason ? `<div class="ai-zh">${esc(msg.reason)}</div>` : ''}
        ${meta}
      </div>
    </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

function showAI(textEn, textZh, hasTracks = false) {
  chatMessages.push({
    role: 'assistant',
    say: textEn,
    reason: textZh,
    time: fmtNow(),
    hasTracks,
  });
  renderChat();
}

function initAI() {
  renderChat();
}

// ═══════════════════════════════════════════════════════
// PLAYER INFO
// ═══════════════════════════════════════════════════════
function updatePlayerInfo(title, sub) {
  $('#np-title').textContent = title || 'Claudio.fm';
  $('#np-artist').textContent = sub || '';
  // Update fav icon
  try {
    const favs = JSON.parse(localStorage.getItem('claudio_favs') || '[]');
    $('#btn-fav').classList.toggle('liked', favs.some(f => f.title === title));
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════
// QUEUE — Track list with current-song highlight
// ═══════════════════════════════════════════════════════
function initQueue() { renderQueue(); }

async function checkRefill() {
  // Count remaining tracks with URLs from current position
  const remaining = queue.slice(currentQueueIdx + 1).filter(t => t.url).length;
  if (remaining < 2 && queue.length > 0) {
    console.log('[refill] Queue low (' + remaining + ' remaining), triggering AI...');
    try { await window.claudio.refillQueue(); } catch { /* offline */ }
  }
}

function skipTrack(dir) {
  if (!queue.length) return;
  let newIdx = currentQueueIdx + dir;
  // Skip dead tracks (no URL)
  while (newIdx >= 0 && newIdx < queue.length) {
    if (queue[newIdx]?.url) break;
    newIdx += dir;
  }
  if (newIdx < 0 || newIdx >= queue.length) return;
  currentQueueIdx = newIdx;
  renderQueue();
  const track = queue[currentQueueIdx];
  if (track?.url) {
    updatePlayerInfo(track.label || track.name, track.album || track.artists || '');
    playAudio(track.url);
  }
  checkRefill();
}

function renderQueue() {
  const container = $('#queue-list');
  const count = $('#queue-count');
  count.textContent = `${queue.length} ${t('tracks')}`;
  // Enable skip buttons when queue is non-empty
  const hasQ = queue.length > 0;
  $('#btn-prev').disabled = !hasQ || currentQueueIdx <= 0;
  $('#btn-next').disabled = !hasQ || currentQueueIdx >= queue.length - 1;

  if (!queue.length) {
    container.innerHTML = `<div class="queue-empty">${t('queueEmpty')}<br><span class="queue-hint">${t('queueEmptyHint')}</span></div>`;
    return;
  }

  container.innerHTML = queue.map((tr, i) => {
    const active = i === currentQueueIdx;
    const dead = !tr.url;
    const cls = active ? 'queue-track active' : (dead ? 'queue-track dead' : 'queue-track');
    const dot = active ? '<span class="dot-pulse green sm" style="margin-right:6px"></span>' : (dead ? '<span class="dot-static" style="background:#444;margin-right:6px"></span>' : '');
    const title = tr.label || tr.name || tr.title || '?';
    const artist = tr.artist || tr.album || tr.sub || '';

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
  // Start disabled — no track loaded
  $('#btn-play').disabled = true;

  // Skip controls
  $('#btn-prev').addEventListener('click', () => skipTrack(-1));
  $('#btn-next').addEventListener('click', () => skipTrack(1));

  // ── Heart / favorite ──
  let favorites = JSON.parse(localStorage.getItem('claudio_favs') || '[]');
  const btnFav = $('#btn-fav');
  const updateFavUI = () => {
    const title = $('#np-title').textContent;
    const liked = favorites.some(f => f.title === title);
    btnFav.classList.toggle('liked', liked);
  };
  btnFav.addEventListener('click', () => {
    const title = $('#np-title').textContent;
    const artist = $('#np-artist').textContent;
    if (!title || title === '—' || title === 'Claudio.fm') return;
    const idx = favorites.findIndex(f => f.title === title);
    if (idx >= 0) {
      favorites.splice(idx, 1);
    } else {
      favorites.unshift({ title, artist, time: fmtNow() });
    }
    localStorage.setItem('claudio_favs', JSON.stringify(favorites));
    updateFavUI();
    renderFavs();
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    $('#icon-play').style.display = '';
    $('#icon-pause').style.display = 'none';
    $('#btn-play').classList.remove('active');
    if (audio.src && !audio.src.endsWith('null')) {
      setPlayerState('ready');
      savePlaybackState();
    }
  });

  audio.addEventListener('ended', () => {
    isPlaying = false;
    // Auto-next: skip dead tracks, find next playable
    let nextIdx = currentQueueIdx + 1;
    while (nextIdx < queue.length && !queue[nextIdx]?.url) nextIdx++;
    if (nextIdx < queue.length && queue[nextIdx]?.url) {
      currentQueueIdx = nextIdx;
      renderQueue();
      const tr = queue[currentQueueIdx];
      updatePlayerInfo(tr.label || tr.name, tr.album || tr.artists || '');
      playAudio(tr.url);
      checkRefill();
    } else {
      $('#icon-play').style.display = '';
      $('#icon-pause').style.display = 'none';
      setPlayerState('idle');
      localStorage.removeItem('claudio_playback');
    }
  });

  audio.addEventListener('error', () => {
    showAI(t('audioError'), null);
    $('#progress-fill').style.width = '0%';
    setPlayerState('idle');
    if (stuckTimer) clearTimeout(stuckTimer);
  });

  // Detect stalled/broken playback
  audio.addEventListener('stalled', () => {
    console.warn('[audio] stalled — source may be unreachable');
  });

  // ── Progress bar seeking ──
  const progressTrack = $('#progress-track');
  const progressThumb = $('#progress-thumb');
  const hoverTime = $('#hover-time');
  let isDragging = false;

  function getSeekPercent(e) {
    const rect = progressTrack.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }

  progressTrack.addEventListener('mousedown', (e) => {
    isDragging = true;
    progressTrack.classList.add('dragging');
    const pct = getSeekPercent(e);
    if (audio.duration) {
      audio.currentTime = (pct / 100) * audio.duration;
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) {
      // Hover tooltip
      if (audio.duration && progressTrack.matches(':hover')) {
        const pct = getSeekPercent(e);
        hoverTime.textContent = fmtTime((pct / 100) * audio.duration);
        hoverTime.style.left = `${pct}%`;
        hoverTime.classList.add('visible');
      } else {
        hoverTime.classList.remove('visible');
      }
      return;
    }
    // Dragging
    const pct = getSeekPercent(e);
    if (audio.duration) {
      audio.currentTime = (pct / 100) * audio.duration;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      progressTrack.classList.remove('dragging');
      savePlaybackState();
    }
  });

  let stuckTimer = null;
  let lastTime = -1;
  let lastSave = 0;
  audio.addEventListener('timeupdate', () => {
    if (audio.duration && isFinite(audio.duration)) {
      const pct = (audio.currentTime / audio.duration) * 100;
      if (!isDragging) {
        $('#progress-fill').style.width = `${pct}%`;
        $('#progress-thumb').style.left = `${pct}%`;
      }
      $('#time-now').textContent = fmtTime(audio.currentTime);
      $('#time-total').textContent = fmtTime(audio.duration);
      // Buffered
      if (audio.buffered.length) {
        const bufEnd = audio.buffered.end(audio.buffered.length - 1);
        if (audio.duration) {
          $('#progress-buffered').style.width = `${(bufEnd / audio.duration) * 100}%`;
        }
      }
    }
    // Detect stuck
    if (isPlaying && audio.currentTime === lastTime && audio.currentTime === 0) {
      // still not progressing
    } else {
      lastTime = audio.currentTime;
      if (stuckTimer) { clearTimeout(stuckTimer); stuckTimer = null; }
    }
    // Debounced save every 3 seconds
    const now = Date.now();
    if (now - lastSave > 3000) {
      lastSave = now;
      if (!isDragging) savePlaybackState();
    }
  });

  // If play event fires but no timeupdate within 4 seconds → stuck
  audio.addEventListener('play', () => {
    isPlaying = true;
    $('#icon-play').style.display = 'none';
    $('#icon-pause').style.display = '';
    $('#btn-play').classList.add('active');
    setPlayerState('playing');
    lastTime = -1;
    if (stuckTimer) clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      if (isPlaying && audio.currentTime < 0.5 && !audio.duration) {
        console.warn('[audio] stuck detected — no progress after 4s');
        audio.pause();
        showAI(t('audioError'), null);
        $('#progress-fill').style.width = '0%';
        setPlayerState('idle');
      }
      stuckTimer = null;
    }, 4000);
  });
}

function playAudio(url) {
  const audio = $('#audio');
  audio.src = url;
  setPlayerState('ready');
  audio.play().catch(err => {
    console.error('[audio] Play failed:', err);
  });
  savePlaybackState();
  // Add to play history
  addToHistory($('#np-title').textContent, $('#np-artist').textContent);
}

// ── Play history ──
function addToHistory(title, artist) {
  if (!title || title === '—' || title === 'Claudio.fm') return;
  // Remove duplicate if already in history
  playHistory = playHistory.filter(h => h.title !== title);
  playHistory.unshift({ title, artist, time: fmtNow() });
  if (playHistory.length > 20) playHistory = playHistory.slice(0, 20);
  localStorage.setItem('claudio_history', JSON.stringify(playHistory));
  renderHistory();
}

function renderFavs() {
  const container = $('#favs-list');
  const favs = JSON.parse(localStorage.getItem('claudio_favs') || '[]');
  if (!favs.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<div class="favs-head">❤️ FAVORITES (${favs.length})</div>`
    + favs.slice(0, 10).map((f, i) =>
      `<div class="favs-item">
        <span class="fi-del" data-fi="${i}" title="删除">✕</span>
        <span class="fi-title">${esc(f.title)}${f.artist ? ' — ' + esc(f.artist) : ''}</span>
      </div>`
    ).join('');
  // Delete handlers
  container.querySelectorAll('.fi-del').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.fi);
      const favs = JSON.parse(localStorage.getItem('claudio_favs') || '[]');
      favs.splice(idx, 1);
      localStorage.setItem('claudio_favs', JSON.stringify(favs));
      renderFavs();
      updateFavUI();
    });
  });
}

function renderHistory() {
  const container = $('#history-list');
  if (!playHistory.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `<div class="history-head">${lang === 'zh' ? '最近播放' : 'RECENT'}</div>`
    + playHistory.slice(0, 5).map(h =>
      `<div class="history-item">
        <span class="hi-time">${h.time}</span>
        <span class="hi-title" title="${esc(h.title)} — ${esc(h.artist)}">${esc(h.title)}${h.artist ? ' — ' + esc(h.artist) : ''}</span>
      </div>`
    ).join('');
}

// ── Load saved playlist from local archive ──
async function loadSavedPlaylist() {
  try {
    const { ok, count } = await window.claudio.getSavedPlaylist();
    if (ok && count > 0) {
      console.log(`[archive] ${count} tracks available (AI will reference them, not queue directly)`);
    }
  } catch { /* no saved data */ }
}

// ── Resume playback on restart ──
function savePlaybackState() {
  const audio = $('#audio');
  if (!audio.src || audio.src.endsWith('null')) return;
  const st = {
    url: audio.src,
    title: $('#np-title').textContent,
    artist: $('#np-artist').textContent,
    position: audio.currentTime || 0,
    queue: queue,
    queueIdx: currentQueueIdx,
  };
  localStorage.setItem('claudio_playback', JSON.stringify(st));
}

function loadPlaybackState() {
  try {
    const saved = JSON.parse(localStorage.getItem('claudio_playback'));
    if (!saved?.url) return;
    if (saved.queue?.length) {
      queue = saved.queue;
      currentQueueIdx = saved.queueIdx || 0;
      renderQueue();
    }
    updatePlayerInfo(saved.title, saved.artist);
    const audio = $('#audio');
    audio.src = saved.url;
    audio.currentTime = saved.position || 0;
    setPlayerState('ready');
    audio.play().catch(() => {
      // Autoplay may be blocked; user can click play
    });
  } catch { /* ignore */ }
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════
// VOLUME — Thin slider
// ═══════════════════════════════════════════════════════
function initVolume() {
  const slider = $('#volume-slider');
  const audio = $('#audio');
  const saved = localStorage.getItem('claudio_volume');
  slider.value = saved != null ? saved : 80;
  audio.volume = slider.value / 100;

  slider.addEventListener('input', () => {
    audio.volume = slider.value / 100;
    localStorage.setItem('claudio_volume', slider.value);
  });
}

// ═══════════════════════════════════════════════════════
// THEME TOGGLE — DARK / LIGHT (invert)
// ═══════════════════════════════════════════════════════
function initThemeToggle() {
  $('#btn-theme').addEventListener('click', () => {
    dark = !dark;
    $('#btn-theme').textContent = dark ? t('themeDark') : t('themeLight');
    document.body.style.filter = dark ? 'none' : 'invert(0.9) hue-rotate(180deg)';
  });
}

// ═══════════════════════════════════════════════════════
// LANGUAGE TOGGLE — EN ↔ 中文
// ═══════════════════════════════════════════════════════
function initLangToggle() {
  $('#btn-lang').addEventListener('click', () => {
    lang = lang === 'en' ? 'zh' : 'en';
    localStorage.setItem('claudio_lang', lang);
    applyLanguage();
  });
}

// ═══════════════════════════════════════════════════════
// SETTINGS — API key + Model + Netease import
// ═══════════════════════════════════════════════════════

function parseImportInput(input) {
  const s = (input || '').trim();
  if (!s) return null;
  // Share link: extract playlist ID
  const m = s.match(/music\.163\.com.*[?&/]id=(\d+)/);
  if (m) return { type: 'playlist', id: m[1] };
  // Share link: short format "123456789"
  if (/^\d+$/.test(s)) return { type: 'uid', id: s };
  // Might be a UID (numbers only) but check length
  if (/^\d{5,}$/.test(s)) return { type: 'uid', id: s };
  return { type: 'invalid' };
}

async function initSettings() {
  const gearBtn = $('#btn-settings');
  const overlay = $('#settings-overlay');
  const closeBtn = $('#btn-settings-close');
  const modelSelect = $('#model-select');
  const btnImport = $('#btn-import');
  const importStatus = $('#import-status');
  const importInput = $('#import-input');
  const apiKeyInput = $('#api-key-input');
  const apiKeyNote = $('#api-key-note');
  const btnSaveKey = $('#btn-save-key');

  gearBtn.addEventListener('click', async () => {
    overlay.classList.remove('hidden');
    importInput.placeholder = t('importPlaceholder');
    checkApiStatus();
    // Show saved UID
    try {
      const { uid } = await window.claudio.getSavedUid();
      if (uid && !importInput.value) importInput.value = uid;
    } catch { /* ignore */ }
    // Load API key
    try {
      const { key } = await window.claudio.getApiKey();
      apiKeyInput.value = key || '';
      apiKeyNote.textContent = key ? t('keySaved') : '';
      apiKeyNote.className = 'setting-note';
    } catch { /* ignore */ }
    // Load model settings
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
      $('#model-note').textContent = `${t('modelCurrent')} ${settings.model}`;
    } catch { /* ignore */ }
  });

  closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });

  // ── API Key ──
  btnSaveKey.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      apiKeyNote.textContent = t('keyInvalid');
      apiKeyNote.className = 'setting-note error';
      return;
    }
    btnSaveKey.disabled = true;
    btnSaveKey.textContent = t('savingKey');
    try {
      await window.claudio.setApiKey(key);
      apiKeyNote.textContent = t('keySaved');
      apiKeyNote.className = 'setting-note success';
    } catch (err) {
      apiKeyNote.textContent = err.message;
      apiKeyNote.className = 'setting-note error';
    } finally {
      btnSaveKey.disabled = false;
      btnSaveKey.textContent = t('saveKey');
    }
  });

  modelSelect.addEventListener('change', async () => {
    const model = modelSelect.value;
    try {
      await window.claudio.setModel(model);
      $('#model-note').textContent = `${t('modelSwitched')} ${model}`;
    } catch {
      $('#model-note').textContent = t('modelSwitchFail');
    }
  });

  // ── API status ──
  const apiDot = $('#api-dot');
  const apiStatusText = $('#api-status-text');

  async function checkApiStatus() {
    try {
      const [api, prox] = await Promise.all([
        window.claudio.pingApi().catch(() => ({ ok: false })),
        window.claudio.pingProxy().catch(() => ({ ok: false })),
      ]);
      apiDot.className = api.ok ? 'api-dot online' : 'api-dot offline';
      apiStatusText.textContent = `API: ${api.ok ? 'ON' : 'OFF'} | Proxy: ${prox.ok ? 'ON' : 'OFF'}`;
    } catch {
      apiDot.className = 'api-dot offline';
      apiStatusText.textContent = 'API: OFF | Proxy: OFF';
    }
  }

  // ── Queue hint → open settings ──
  $('#queue-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('queue-hint')) {
      overlay.classList.remove('hidden');
      importInput.placeholder = t('importPlaceholder');
    }
  });

  // ── Netease import ──
  btnImport.addEventListener('click', async () => {
    const raw = importInput.value.trim();
    const parsed = parseImportInput(raw);

    if (!parsed || parsed.type === 'invalid') {
      importStatus.className = 'setting-note error';
      importStatus.textContent = t('importInvalid');
      return;
    }

    btnImport.disabled = true;
    btnImport.textContent = t('importing');
    importStatus.className = 'setting-note';
    importStatus.textContent = t('connecting');

    try {
      let result;
      if (parsed.type === 'playlist') {
        result = await window.claudio.importPlaylist(parsed.id);
      } else {
        result = await window.claudio.importNetease(parsed.id, '');
      }
      if (!result.ok) throw new Error(result.error);
      importStatus.className = 'setting-note success';
      importStatus.textContent = t('importDone', result.totalTracks, result.playlistCount || 1);
    } catch (err) {
      importStatus.className = 'setting-note error';
      importStatus.textContent = err.message;
    } finally {
      btnImport.disabled = false;
      btnImport.textContent = t('importBtn');
    }
  });

  // Progress updates from backend
  if (window.claudio.onImportProgress) {
    window.claudio.onImportProgress((data) => {
      if (data.phase === 'tracks') {
        importStatus.textContent = `[${data.current}/${data.total}] ${data.message}`;
      } else {
        importStatus.textContent = data.message;
      }
    });
  }
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
