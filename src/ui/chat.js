/**
 * Claudio UI — Chat & AI Pipeline (src/ui/chat.js)
 *
 * Chat rendering, AI fetch/response handling, TTS playback, easter eggs.
 * LOADED SECOND — depends on player.js globals: _busy, _recent, queue, currentIdx,
 *   playAudio, renderQueue, updatePlayerInfo, setPlayerState, $, t, fmtNow, esc.
 */

// ── TTS instance guard + global gain for DJ volume control ──
let _currentTts = null;
let _ttsGain = null, _ttsActx = null;

function getTtsGain() {
  const slider = $('#dj-vol-slider');
  return slider ? parseInt(slider.value) / 100 : 1.6;
}
// Live update: slider changes immediately affect current TTS
function initDjVolume() {
  const slider = $('#dj-vol-slider');
  if (!slider) return;
  slider.addEventListener('input', () => {
    if (_ttsGain) _ttsGain.gain.value = getTtsGain();
  });
}

// ── Retry state (Bug 4 fix: prevent infinite fallback→refill loop) ──
let _fallbackCount = 0;
const MAX_FALLBACK_RETRIES = 3;

// ── Circuit breaker (Plan 2: stop AI loop when search keeps failing) ──
let _failStreak = 0;
const MAX_FAIL_STREAK = 3;
// Hardcoded tracks guaranteed free & playable on Netease
const LOCAL_FALLBACK = [
  '周杰伦 晴天', '陈奕迅 十年', '林俊杰 江南', '王菲 红豆', '张学友 吻别',
];

// ── Default fallback playlist (Bug 4 fix: AI empty → play backup) ──
const DEFAULT_FALLBACK = [
  { label: '周杰伦 - 晴天', name: '晴天', artists: '周杰伦', album: '叶惠美', url: '' },
  { label: '陈奕迅 - 好久不见', name: '好久不见', artists: '陈奕迅', album: '认了吧', url: '' },
  { label: '邓紫棋 - 光年之外', name: '光年之外', artists: '邓紫棋', album: '光年之外', url: '' },
  { label: '林俊杰 - 不为谁而作的歌', name: '不为谁而作的歌', artists: '林俊杰', album: '和自己对话', url: '' },
  { label: '蔡依林 - 日不落', name: '日不落', artists: '蔡依林', album: '特务J', url: '' },
];

// ── Chat rendering ──
function showChat(speech, hasTracks) {
  if (!speech) return;
  chatMessages.push({ role:'assistant', say:speech, time:fmtNow(), hasTracks });
  renderChat();
}
function renderChat() {
  const c = document.getElementById('ai-chat');
  if (!c) return;
  if (!chatMessages.length) { c.innerHTML = '<div class="chat-msg assistant"><div class="msg-avatar">♪</div><div class="msg-bubble"><div class="ai-en">电台已就绪</div></div></div>'; return; }
  c.innerHTML = chatMessages.map(m => {
    const userCls = m.role==='user'?'user':'assistant';
    const avatar = m.role==='user'?'':'<div class="msg-avatar">♪</div>';
    const bubble = m.role==='user'
      ? `<div class="msg-bubble">${esc(m.content||m.say||'')}</div>`
      : `<div class="msg-bubble"><div class="ai-en">${esc(m.say||'')}</div><div class="msg-meta"><span class="msg-time">${m.time}</span></div></div>`;
    return `<div class="chat-msg ${userCls}">${avatar}${bubble}</div>`;
  }).join('');
  c.scrollTop = c.scrollHeight;
}

// ── UI Lock (Bug 2 fix: prevent concurrent input during AI processing) ──
function lockUI() {
  const input = $('#chat-input'), send = $('#btn-send');
  const prev = $('#btn-prev'), next = $('#btn-next');
  if (input) { input.disabled = true; input.style.opacity = '0.4'; }
  if (send)  { send.disabled = true;  send.style.opacity = '0.4'; }
  if (prev)  { prev.disabled = true;  prev.style.opacity = '0.4'; }
  if (next)  { next.disabled = true;  next.style.opacity = '0.4'; }
}
function unlockUI() {
  const input = $('#chat-input'), send = $('#btn-send');
  const prev = $('#btn-prev'), next = $('#btn-next');
  if (input) { input.disabled = false; input.style.opacity = ''; }
  if (send)  { send.disabled = false;  send.style.opacity = ''; }
  if (prev)  { prev.disabled = false;  prev.style.opacity = ''; }
  if (next)  { next.disabled = false;  next.style.opacity = ''; }
}

// ── TTS safe play (Bug 2 fix: kill old TTS before new, ensure unlock on end) ──
function playTts(ttsFile, volume, onEnd) {
  // Kill previous TTS instance to prevent overlapping speech
  if (_currentTts) {
    try { _currentTts.pause(); } catch {}
    _currentTts = null;
  }
  const tts = new Audio(ttsFile);
  _currentTts = tts;
  try {
    _ttsActx = new (window.AudioContext || window.webkitAudioContext)();
    const src = _ttsActx.createMediaElementSource(tts);
    _ttsGain = _ttsActx.createGain();
    _ttsGain.gain.value = getTtsGain();
    src.connect(_ttsGain);
    _ttsGain.connect(_ttsActx.destination);
  } catch { tts.volume = 1.0; }
  tts.onended = () => {
    _currentTts = null;
    if (onEnd) onEnd();
    else { _busy = false; unlockUI(); }
  };
  tts.onerror = () => {
    _currentTts = null;
    _busy = false;
    unlockUI();
    if (onEnd) onEnd();
  };
  tts.play().catch(() => {
    _currentTts = null;
    _busy = false;
    unlockUI();
    if (onEnd) onEnd();
  });
}

// ── AI Fetch ──
async function fetchAI(msg, hidden) {
  if (_busy) return;
  _busy = true;
  lockUI();
  try {
    const m = hidden ? hidden+'\n'+msg : msg;
    const ctx = _recent.length ? '[最近播放：'+_recent.join(' → ')+']\n'+m : m;
    const res = await window.claudio.sendMessage(ctx);
    if (!res.ok) throw new Error(res.error);
    handleResponse(res);
  } catch(e) {
    showChat(t('connError'), false);
    handleFallback();  // Bug 4 fix: AI error → play fallback, don't deadlock
  }
}

let _lastRefill = 0;
async function refill() {
  if (_busy) return;
  // Cooldown: don't refill within 30s of last refill
  if (Date.now() - _lastRefill < 30000) return;
  _lastRefill = Date.now();
  // Plan 2: circuit breaker — don't call AI if search keeps failing
  if (_failStreak >= MAX_FAIL_STREAK) {
    console.log('[breaker] refill blocked — circuit open');
    return;
  }
  const h = new Date().getHours();
  const mood = h<6?'深夜':h<9?'清晨':h<12?'上午':h<14?'午后':h<17?'下午':h<19?'傍晚':'夜晚';
  fetchAI(mood+'了，推荐下一首', '');
}

// ── Bug 4 + Plan 2 fix: fallback with circuit breaker ──
function handleFallback() {
  _fallbackCount++;
  _failStreak++;
  if (_failStreak >= MAX_FAIL_STREAK) {
    // Circuit breaker: stop all AI calls, play local
    console.log(`[breaker] AI + search failing (${_failStreak}x) — circuit open`);
    showChat('AI 暂时无法连接，为你播放一首经典。恢复后说"换一首"即可。', false);
    const fb = DEFAULT_FALLBACK[Math.floor(Math.random() * DEFAULT_FALLBACK.length)];
    queue = [{ label: fb.label, name: fb.name, artists: fb.artists, url: '' }];
    currentIdx = 0; renderQueue();
    updatePlayerInfo(fb.label, fb.album);
    _busy = false;
    unlockUI();
  } else if (_fallbackCount <= MAX_FALLBACK_RETRIES) {
    console.log(`[fallback] AI failed, retry ${_fallbackCount}/${MAX_FALLBACK_RETRIES}`);
    _busy = false;
    unlockUI();
    setTimeout(refill, 2000);
  } else {
    _failStreak = MAX_FAIL_STREAK; // force circuit open
    const fb = DEFAULT_FALLBACK[Math.floor(Math.random() * DEFAULT_FALLBACK.length)];
    showChat('AI 暂时无法连接，为你播放一首经典。', false);
    queue = [{ label: fb.label, name: fb.name, artists: fb.artists, url: '' }];
    currentIdx = 0; renderQueue();
    updatePlayerInfo(fb.label, fb.album);
    _busy = false;
    unlockUI();
  }
}

// ── Handle AI response ──
function handleResponse(data) {
  // Bug 4 + Plan 2 fix: reset retry counters on ANY successful AI response
  _fallbackCount = 0;
  _failStreak = 0;

  const sysLog = data.system_log || '';
  const djSpeech = data.dj_speech || data.speech || data.monologue || data.say || '';
  const action = data.action_type || 'chat_only';
  const query = data.search_query || null;
  const tracks = data.tracks || [];
  const hasTracks = tracks.length > 0 && tracks.some(t=>t.url);
  const ttsFile = data.tts;

  // Show system_log dim, dj_speech normal
  if (sysLog) {
    chatMessages.push({ role:'system', say:sysLog, time:fmtNow(), hasTracks:false });
    renderChat();
  }

  // chat_only → just speak, NEVER touch music
  if (action === 'chat_only') {
    showChat(djSpeech, false);
    if (ttsFile && ttsFile.startsWith('data:')) {
      const a = document.getElementById('audio');
      const v = a ? a.volume : 1;
      if (a && a.src && !a.src.endsWith('null')) {
        fadeVol(a, v, v, () => {
          playTts(ttsFile, v, () => { fadeVol(a, a.volume, v); _busy = false; unlockUI(); });
        });
      } else {
        playTts(ttsFile, v);
      }
    } else {
      _busy = false;
      unlockUI();
    }
    return;
  }

  // change_song → actually play new music (Plan 3: single track, no queue)
  showChat(djSpeech, hasTracks);
  if (hasTracks) {
    const tr = tracks[0];
    // Soft dedup: only skip if this exact track was the LAST one played (not all history)
    const label = (tr.label || tr.name || '').toLowerCase();
    const lastPlayed = _recent.length ? _recent[_recent.length - 1].toLowerCase() : '';
    if (lastPlayed && lastPlayed.includes(label)) {
      console.log('[breaker] Back-to-back repeat, skipping:', tr.label);
      showChat('刚听过这首，换一首。', false);
      _busy = false; unlockUI();
      setTimeout(refill, 500);
      return;
    }
    currentTrack = tr;
    updatePlayerInfo(tr.label||tr.name, tr.album||'', tr.id);
    // Music first, DJ voice-overs after 300ms
    playAudio(tr.url);
    if (ttsFile && ttsFile.startsWith('data:')) {
      setTimeout(() => {
        const a2 = document.getElementById('audio');
        const v2 = a2 ? a2.volume : 1;
        fadeVol(a2, v2, 0.08, () => {
          playTts(ttsFile, v2, () => {
            const a3 = document.getElementById('audio');
            if (a3) fadeVol(a3, a3.volume, v2, () => {});
            _busy = false;
            unlockUI();
          });
        });
      }, 300);
    } else {
      _busy = false;
      unlockUI();
    }
  } else {
    // Plan 2: circuit breaker — don't call AI again if search keeps failing
    _failStreak++;
    if (_failStreak >= MAX_FAIL_STREAK) {
      console.log(`[breaker] ${_failStreak} consecutive failures — playing local fallback`);
      showChat('暂时找不到在线音源，为你播放一首经典。', false);
      const fallbackQuery = LOCAL_FALLBACK[Math.floor(Math.random() * LOCAL_FALLBACK.length)];
      // Try ONE local fallback, don't retry AI
      _busy = false;
      unlockUI();
      tryLocalFallback(fallbackQuery);
    } else {
      showChat(`"${query||'未知'}" 无原唱音源，换一首`, false);
      _busy = false;
      unlockUI();
      setTimeout(refill, 500);
    }
  }
}

// ── Plan 2: Try single local fallback, no AI involved ──
async function tryLocalFallback(query) {
  try {
    const res = await window.claudio.sendMessage(`(system-fallback) 请推荐一首: ${query}`);
    if (res.ok && res.tracks?.length) {
      const t = res.tracks[0];
      if (t.url) {
        queue = [t]; currentIdx = 0; renderQueue();
        updatePlayerInfo(t.label||t.name, t.album||'');
        playAudio(t.url);
        return;
      }
    }
  } catch {}
  // Even local fallback failed — just release and wait
  _failStreak = MAX_FAIL_STREAK; // stays broken until user manually chats
  setPlayerState('idle');
}


function fadeVol(a, from, to, onDone) {
  if (!a || !a.src || a.src.endsWith('null')) { if (onDone) onDone(); return; }
  const steps = 6, dur = 400, delta = (to - from) / steps;
  let s = 0, cur = from;
  const t = setInterval(() => {
    s++; cur += delta;
    a.volume = Math.max(to, Math.min(from, cur));
    if (s >= steps) { clearInterval(t); a.volume = to; if (onDone) onDone(); }
  }, dur / steps);
}

// ── V2.8 Background Storyteller ──
let _pendingStory = null;
let _storyTriggered = false;

// Called after playAudio: start async story generation
async function startBackgroundStory(trackLabel) {
  _pendingStory = null;
  _storyTriggered = false;
  if (!trackLabel || _failStreak >= MAX_FAIL_STREAK) { console.log('[story] skipped (breaker)'); return; }
  console.log('[story] Fetching story for:', trackLabel);

  // Collect 2-3 lyric lines as inspiration
  let lyricSnippet = '';
  if (_lyricLines && _lyricLines.length > 3) {
    const picks = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * _lyricLines.length);
      if (!picks.includes(idx)) picks.push(idx);
    }
    lyricSnippet = picks.sort((a,b)=>a-b).map(i => _lyricLines[i].text).join(' / ');
  }

  try {
    const res = await window.claudio.tellStory(trackLabel, lyricSnippet);
    if (res?.ok && res?.story) {
      _pendingStory = res;
      console.log('[story] Ready:', res.story.substring(0, 50));
    } else {
      console.log('[story] Failed:', res?.error || 'no story');
    }
  } catch (e) { console.log('[story] Error:', e.message); }
}

// Called from timeupdate at ~50%: output story segments synced to speech
function checkMidStory() {
  if (_storyTriggered || !_pendingStory || _busy) { return; }
  console.log('[story] Mid-song trigger! Outputting story...');
  _storyTriggered = true;

  const { story, tts } = _pendingStory;
  const segments = story
    .split(/\n|。/)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  if (!segments.length) return;

  // Show segments one by one, synced to estimated speech time (~4 chars/sec for Chinese TTS)
  let idx = 0;
  function showNext() {
    if (idx < segments.length) {
      showChat(segments[idx], false);
      const delay = Math.max(segments[idx].length * 250, 2000); // ~4 chars/sec → 250ms/char
      idx++;
      setTimeout(showNext, delay);
    }
  }
  showNext();

  // TTS playback
  if (tts && tts.startsWith('data:')) {
    const a = document.getElementById('audio');
    const v = a ? a.volume : 1;
    playTts(tts, v);
  }
}

// ── Easter egg: command interception ──
const EASTER_TRIGGERS = ['/sudo creator', '你是谁做的', 'who made you', '谁做的'];
function checkEasterEgg(msg) {
  const m = msg.toLowerCase().trim();
  if (EASTER_TRIGGERS.some(t => m.includes(t.toLowerCase()))) {
    const a = document.getElementById('audio');
    if (a && a.src) fadeVol(a, a.volume, 0.10);
    const app = document.getElementById('app');
    app.style.filter = 'brightness(1.5)';
    setTimeout(() => app.style.filter = '', 300);
    const sec = '你触发了隐藏频段。本电台由台长 Galton欣城 于 2026 年无数个熬夜的深夜中构建。祝你今夜好梦。';
    chatMessages.push({ role:'assistant', say:sec, time:fmtNow(), hasTracks:false, isEaster:true });
    renderChat();
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(sec);
      u.lang = 'zh-CN'; u.rate = 0.85;
      const done = () => { if (a) fadeVol(a, a.volume||1, a.volume||1); };
      u.onend = done; u.onerror = done;
      speechSynthesis.cancel();
      setTimeout(() => speechSynthesis.speak(u), 500);
    }
    return true;
  }
  return false;
}

// ── Easter egg: 7-tap logo → developer mode ──
let _logoTaps = 0, _logoTimer = null;
function initLogoTap() {
  const logo = document.querySelector('.logo');
  if (!logo) return;
  logo.style.cursor = 'pointer';
  logo.addEventListener('dblclick', e => { e.preventDefault(); e.stopPropagation(); });
  logo.addEventListener('mousedown', e => {
    e.preventDefault();
    _logoTaps++;
    if (_logoTimer) clearTimeout(_logoTimer);
    _logoTimer = setTimeout(() => { _logoTaps = 0; }, 2500);
    if (_logoTaps >= 7) {
      _logoTaps = 0; clearTimeout(_logoTimer);
      chatMessages.push({ role:'assistant', say:'Created by Galton欣城', time:fmtNow(), hasTracks:false, isDev:true });
      renderChat();
      const anthem = new Audio('../Crt/TEMPOREX - Daydream.mp3');
      const a = document.getElementById('audio');
      if (a && a.src) fadeVol(a, a.volume, 0.15, () => anthem.play());
      else anthem.play();
      anthem.onended = () => { if (a && a.src) fadeVol(a, 0.15, a.volume||1); };
    }
  });
}

function initChat() {
  const input=$('#chat-input'),btn=$('#btn-send');
  btn.addEventListener('click',()=>{
    const m=input.value.trim();if(!m)return;input.value='';
    chatMessages.push({role:'user',content:m,time:fmtNow()});renderChat();
    if (checkEasterEgg(m)) return;
    // V2.8: manual story trigger
    if (/讲讲这首|说说这歌|介绍.*歌/.test(m)) {
      if (_pendingStory?.story) {
        checkMidStory();
      } else {
        const label = ($('#np-title').textContent||'') + ' - ' + ($('#np-artist').textContent||'');
        startBackgroundStory(label).then(() => {
          setTimeout(() => { if (_pendingStory?.story) checkMidStory(); }, 2000);
        });
      }
      input.value=''; return;
    }
    fetchAI(m,'');
  });
  input.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click();});
}
