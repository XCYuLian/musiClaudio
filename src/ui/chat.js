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
function initDjVolume() {
  const slider = $('#dj-vol-slider');
  if (!slider) return;
  slider.addEventListener('input', () => {
    if (_ttsGain) _ttsGain.gain.value = getTtsGain();
  });
}

// ── VOX Voice Matrix ──
async function initVoxPanel() {
  const btn = $('#btn-vox');
  const panel = $('#vox-panel');
  const cards = $('#vox-cards');
  if (!btn || !panel || !cards) return;

  // Load voice profiles from main process
  let profiles = [];
  let currentId = '';
  try {
    const res = await window.claudio.getVoices();
    profiles = res?.profiles || [];
    currentId = res?.current || '';
  } catch {}

  if (!profiles.length) {
    profiles = [
      { id: 'saturn_zh_male_shuanglangshaonian_tob', name: '飒爽', desc: '少年感男声 · 清朗明亮' },
      { id: 'zh_male_m191_uranus_bigtts', name: '磐石', desc: '沉稳男声 · 大气厚重' },
    ];
  }

  function render() {
    cards.innerHTML = profiles.map(p => `
      <div class="vox-card${p.id === currentId ? ' active' : ''}" data-vid="${p.id}">
        <div class="vox-dot"></div>
        <div>
          <div class="vox-card-name">${p.name}</div>
          <div class="vox-card-desc">${p.desc}</div>
        </div>
      </div>
    `).join('');

    cards.querySelectorAll('.vox-card').forEach(card => {
      card.addEventListener('click', async () => {
        const vid = card.dataset.vid;
        await window.claudio.setVoice(vid);
        currentId = vid;
        render();
      });
    });
  }

  btn.addEventListener('click', () => panel.classList.toggle('hidden'));
  render();
}

// ── Retry / Circuit breaker (mirrors src/core/config.js) ──
let _fallbackCount = 0;
const MAX_FALLBACK_RETRIES = 3;

let _failStreak = 0;
const MAX_FAIL_STREAK = 3;
const LOCAL_FALLBACK = ['周杰伦 晴天', '陈奕迅 十年', '林俊杰 江南', '王菲 红豆', '张学友 吻别'];
const REFILL_COOLDOWN_MS = 30000;

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
  console.log('[chat] lockUI');
  const input = $('#chat-input'), send = $('#btn-send');
  const prev = $('#btn-prev'), next = $('#btn-next');
  if (input) { input.disabled = true; input.style.opacity = '0.4'; }
  if (send)  { send.disabled = true;  send.style.opacity = '0.4'; }
  if (prev)  { prev.disabled = true;  prev.style.opacity = '0.4'; }
  if (next)  { next.disabled = true;  next.style.opacity = '0.4'; }
}
function unlockUI() {
  console.log('[chat] unlockUI');
  const input = $('#chat-input'), send = $('#btn-send');
  const prev = $('#btn-prev'), next = $('#btn-next');
  if (input) { input.disabled = false; input.style.opacity = ''; }
  if (send)  { send.disabled = false;  send.style.opacity = ''; }
  if (prev)  { prev.disabled = false;  prev.style.opacity = ''; }
  if (next)  { next.disabled = false;  next.style.opacity = ''; }
  // Deferred retry: user message queued during prefetch/story → fire now
  setTimeout(retryPendingMsg, 100);
}

// ── TTS safe play (Bug 2 fix: kill old TTS before new, ensure unlock on end) ──
function playTts(ttsFile, volume, onEnd) {
  console.log(`[chat] playTts start file=${ttsFile?.slice(0,40)}... gain=${getTtsGain().toFixed(2)}`);
  // Kill previous TTS instance to prevent overlapping speech
  if (_currentTts) {
    console.log('[chat] playTts killing previous TTS');
    try { _currentTts.pause(); } catch {}
    _currentTts = null;
  }
  // Close old AudioContext to prevent memory leak (Bug: new AudioContext per TTS call)
  if (_ttsActx) {
    try { _ttsActx.close(); } catch {}
    _ttsActx = null;
    _ttsGain = null;
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

  function cleanup() {
    console.log('[chat] playTts cleanup');
    _currentTts = null;
    // Close AudioContext after TTS playback ends (defer to let tail play)
    if (_ttsActx) {
      const ctx = _ttsActx;
      setTimeout(() => { try { ctx.close(); } catch {} }, 500);
      _ttsActx = null;
      _ttsGain = null;
    }
  }

  tts.onended = () => {
    console.log('[chat] playTts ended');
    cleanup();
    if (onEnd) onEnd();
    else { _busy = false; unlockUI(); }
  };
  tts.onerror = () => {
    console.warn('[chat] playTts error');
    cleanup();
    _busy = false;
    unlockUI();
    if (onEnd) onEnd();
  };
  tts.play().catch(() => {
    console.warn('[chat] playTts play() rejected');
    cleanup();
    _busy = false;
    unlockUI();
    if (onEnd) onEnd();
  });
}

// ── Pending user message queue (deferred retry when blocked by prefetch/story) ──
let _pendingUserMsgs = [];

// ── AI Fetch ──
async function fetchAI(msg, hidden, userInitiated = false) {
  if (_busy) {
    console.log(`[chat] fetchAI blocked: _busy=true → queueing${userInitiated ? ' (user)' : ''}`);
    _pendingUserMsgs.push({ msg, hidden, at: Date.now(), userInitiated });
    return;
  }
  if (_prefetching) {
    console.log(`[chat] fetchAI blocked: prefetching → queueing${userInitiated ? ' (user)' : ''}`);
    _pendingUserMsgs.push({ msg, hidden, at: Date.now(), userInitiated });
    return;
  }
  if (typeof _storyGenerating !== 'undefined' && _storyGenerating) {
    console.log(`[chat] fetchAI blocked: story generating → queueing${userInitiated ? ' (user)' : ''}`);
    _pendingUserMsgs.push({ msg, hidden, at: Date.now(), userInitiated });
    return;
  }
  _pendingUserMsgs = [];
  console.log(`[chat] fetchAI START msg="${msg.slice(0,40)}..."`);
  _busy = true;
  lockUI();
  try {
    const m = hidden ? hidden+'\n'+msg : msg;
    const ctx = _recent.length ? '[最近播放：'+_recent.join(' → ')+']\n'+m : m;
    const res = await window.claudio.sendMessage(ctx);
    if (!res.ok) throw new Error(res.error);
    console.log(`[chat] fetchAI OK action=${res.action_type} hasTracks=${!!(res.tracks?.length)} tts=${!!res.tts}`);
    handleResponse(res);
  } catch(e) {
    console.warn(`[chat] fetchAI FAIL: ${e.message} → handleFallback`);
    showChat(t('connError'), false);
    handleFallback();
  }
}

function retryPendingMsg() {
  if (!_pendingUserMsgs.length) return;
  if (_busy || _prefetching || (typeof _storyGenerating !== 'undefined' && _storyGenerating)) return;
  // Prefer user-initiated messages, then take last
  const userMsgs = _pendingUserMsgs.filter(e => e.userInitiated);
  const entry = userMsgs.length ? userMsgs[userMsgs.length - 1] : _pendingUserMsgs[_pendingUserMsgs.length - 1];
  const dropped = _pendingUserMsgs.length - 1;
  if (dropped > 0) console.log(`[chat] retryPendingMsg → dropped ${dropped} older`);
  _pendingUserMsgs = [];
  // TTL: drop if queued > 60s (context expired)
  if (Date.now() - entry.at > 60000) { console.log('[chat] retryPendingMsg → expired'); return; }
  console.log(`[chat] retryPendingMsg: "${entry.msg.slice(0,40)}..."${entry.userInitiated ? ' (user)' : ''}`);
  // Discard prefetched track — user correction overrides it
  if (typeof _nextTrack !== 'undefined' && _nextTrack) {
    console.log('[chat] retryPendingMsg → discard prefetched _nextTrack');
    _nextTrack = null;
  }
  fetchAI(entry.msg, entry.hidden);
}

let _lastRefill = 0;

// ── Prefetch: load next track in background as soon as current song starts ──
let _nextTrack = null;
let _prefetching = false;

async function prefetchNext() {
  if (_busy) { console.log('[chat] prefetch skip: _busy=true'); return; }
  if (_prefetching || _nextTrack) { console.log(`[chat] prefetch skip: prefetching=${_prefetching} hasNext=${!!_nextTrack}`); return; }
  if (_failStreak >= MAX_FAIL_STREAK) { console.log('[chat] prefetch skip: circuit open'); return; }
  if (typeof _coldBooting !== 'undefined' && _coldBooting) { console.log('[chat] prefetch skip: cold booting'); return; }
  _prefetching = true;
  console.log('[chat] prefetch START');
  try {
    const h = new Date().getHours();
    const mood = h<6?'深夜':h<9?'清晨':h<12?'上午':h<14?'午后':h<17?'下午':h<19?'傍晚':'夜晚';
    const ctx = _recent.length ? '[最近播放：'+_recent.join(' → ')+']\n'+mood+'了，推荐下一首' : mood+'了，推荐下一首';
    const res = await window.claudio.sendMessage(ctx);
    if (res.ok && res.action_type === 'change_song' && res.tracks?.some(t=>t.url)) {
      _nextTrack = res;
      console.log(`[chat] prefetch OK: "${res.tracks[0]?.label}" stored`);
    } else {
      console.log(`[chat] prefetch no-track: action=${res.action_type} tracks=${res.tracks?.length||0}`);
    }
  } catch(e) { console.warn(`[chat] prefetch FAIL: ${e.message}`); }
  _prefetching = false;
  setTimeout(retryPendingMsg, 0);
}

async function refill() {
  if (_busy) { console.log('[chat] refill blocked: _busy=true'); return; }
  if (typeof _coldBooting !== 'undefined' && _coldBooting) { console.log('[chat] refill blocked: cold booting'); return; }
  if (typeof _nextTrack !== 'undefined' && _nextTrack) { console.log('[chat] refill blocked: _nextTrack already set'); return; }
  // Cooldown: don't refill within 30s of last refill
  if (Date.now() - _lastRefill < REFILL_COOLDOWN_MS) { console.log('[chat] refill blocked: cooldown'); return; }
  _lastRefill = Date.now();
  // Plan 2: circuit breaker — don't call AI if search keeps failing
  if (_failStreak >= MAX_FAIL_STREAK) { console.log('[chat] refill blocked: circuit open'); return; }
  console.log('[chat] refill → trigger');
  const h = new Date().getHours();
  const mood = h<6?'深夜':h<9?'清晨':h<12?'上午':h<14?'午后':h<17?'下午':h<19?'傍晚':'夜晚';
  fetchAI(mood+'了，推荐下一首', '');
}

// ── Bug 4 + Plan 2 fix: fallback with circuit breaker ──
function handleFallback() {
  _fallbackCount++;
  _failStreak++;
  console.warn(`[chat] handleFallback count=${_fallbackCount} streak=${_failStreak}/${MAX_FAIL_STREAK}`);
  if (_failStreak >= MAX_FAIL_STREAK) {
    console.warn('[chat] handleFallback → CIRCUIT OPEN, refillQueue');
    showChat('AI 暂时休息，为你播放一首经典。恢复后说"换一首"即可。', false);
    _busy = false;
    unlockUI();
    window.claudio.refillQueue().catch(() => {});
  } else if (_fallbackCount <= MAX_FALLBACK_RETRIES) {
    console.log('[chat] handleFallback → retry refill in 2s');
    _busy = false;
    unlockUI();
    setTimeout(refill, 2000);
  } else {
    console.warn('[chat] handleFallback → MAX retries, circuit open');
    _failStreak = MAX_FAIL_STREAK;
    showChat('AI 暂时休息，为你播放一首经典。', false);
    _busy = false;
    unlockUI();
    window.claudio.refillQueue().catch(() => {});
  }
}

// ── Handle AI response ──
// defer=true: if music is playing, store for autoNext instead of cutting off current song
function handleResponse(data, defer = false) {
  _coldBooting = false;  // first broadcast arrived, resume normal autoNext
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

  console.log(`[chat] handleResponse action=${action} defer=${defer} hasTracks=${hasTracks} tts=${!!ttsFile} speech="${djSpeech.slice(0,30)}..."`);

  // Show system_log dim, dj_speech normal
  if (sysLog) {
    chatMessages.push({ role:'system', say:sysLog, time:fmtNow(), hasTracks:false });
    renderChat();
  }

  // chat_only → just speak, NEVER touch music
  if (action === 'chat_only') {
    console.log('[chat] handleResponse → chat_only');
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

  // change_song — defer if music is playing, don't cut off current song
  showChat(djSpeech, hasTracks);
  if (hasTracks) {
    const tr = tracks[0];
    const label = (tr.label || tr.name || '').toLowerCase();
    const lastPlayed = _recent.length ? _recent[_recent.length - 1].toLowerCase() : '';
    if (lastPlayed && lastPlayed.includes(label)) {
      console.warn(`[chat] handleResponse → back-to-back reject: "${tr.label}"`);
      showChat('刚听过这首，换一首。', false);
      handleFallback();
      return;
    }

    // If defer mode and music is playing, store for autoNext — don't cut off
    const a = document.getElementById('audio');
    const isPlaying = a && !a.paused && a.duration && a.currentTime < a.duration - 0.5;
    if (defer && !_coldBooting && isPlaying) {
      console.log(`[chat] handleResponse → DEFER "${tr.label}" (playing @ ${a.currentTime.toFixed(0)}s/${a.duration.toFixed(0)}s)`);
      _nextTrack = data;
      _busy = false;
      unlockUI();
      return;
    }

    console.log(`[chat] handleResponse → PLAY NOW "${tr.label}"`);
    currentTrack = tr;
    updatePlayerInfo(tr.label||tr.name, tr.album||'', tr.id);
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
    console.warn(`[chat] handleResponse → NO TRACKS streak=${_failStreak}/${MAX_FAIL_STREAK} query="${query||'?'}"`);
    if (_failStreak >= MAX_FAIL_STREAK) {
        showChat('暂时找不到在线音源，为你播放一首经典。', false);
      const fallbackQuery = LOCAL_FALLBACK[Math.floor(Math.random() * LOCAL_FALLBACK.length)];
      console.log(`[chat] handleResponse → tryLocalFallback: "${fallbackQuery}"`);
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
let _storyTimer = null;  // cancellable timer for story segments
let _storyGenerating = false;  // prevent concurrent generation

// Called after playAudio: start async story generation
async function startBackgroundStory(trackLabel) {
  if (_storyGenerating) { console.log('[chat] story skip: already generating'); return; }
  if (_prefetching) { console.log('[chat] story skip: prefetching'); return; }
  if (_busy) { console.log('[chat] story skip: _busy=true'); return; }
  console.log(`[chat] story START label="${trackLabel?.slice(0,40)}" lyricLines=${_lyricLines?.length||0}`);
  _storyGenerating = true;
  _pendingStory = null;
  _storyTriggered = false;
  if (_storyTimer) { clearInterval(_storyTimer); _storyTimer = null; }
  if (!trackLabel || _failStreak >= MAX_FAIL_STREAK) { console.log('[chat] story skip: no label or circuit open'); _storyGenerating = false; return; }

  // Collect 4-5 lyric lines as inspiration (skip instrumentals)
  const INSTRUMENTAL_MARKERS = /纯音乐|请欣赏|instrumental|piano\s*cover|orchestra/i;
  let lyricSnippet = '';
  if (_lyricLines && _lyricLines.length > 3 && !INSTRUMENTAL_MARKERS.test(_lyricLines.map(l=>l.text).join('|'))) {
    const picks = [];
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * _lyricLines.length);
      if (!picks.includes(idx)) picks.push(idx);
    }
    lyricSnippet = picks.sort((a,b)=>a-b).map(i => _lyricLines[i].text).join(' / ');
    console.log(`[chat] story lyricSnippet="${lyricSnippet.slice(0,50)}..."`);
  } else {
    console.log(`[chat] story no lyrics: empty=${!_lyricLines?.length} instrumental=${INSTRUMENTAL_MARKERS.test((_lyricLines||[]).map(l=>l.text).join('|'))}`);
  }

  try {
    const res = await window.claudio.tellStory(trackLabel, lyricSnippet);
    if (res?.ok && res?.story) {
      _pendingStory = res;
      console.log(`[chat] story OK: ${res.story.length} chars`);
    } else {
      console.log(`[chat] story API returned no story: ok=${res?.ok}`);
    }
  } catch (e) { console.warn(`[chat] story FAIL: ${e.message}`); }
  _storyGenerating = false;
  setTimeout(retryPendingMsg, 0);
}

// Called from timeupdate at ~50%: output story timed to TTS playback
function checkMidStory() {
  if (_storyTriggered || !_pendingStory || _busy) { return; }
  _storyTriggered = true;
  console.log(`[chat] checkMidStory TRIGGER sentences=${_pendingStory.story?.split(/[。！？\n]/).length||0}`);

  const { story, tts } = _pendingStory;
  if (!story) return;

  // Cancel any previous story timer
  if (_storyTimer) { clearInterval(_storyTimer); _storyTimer = null; }

  const sentences = story
    .split(/(?<=[。！？\n])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 1);

  // Fallback: no sentences or no TTS → show all at once
  if (!sentences.length || !tts || !tts.startsWith('data:')) {
    showChat(story, false);
    if (tts && tts.startsWith('data:')) {
      const a = document.getElementById('audio');
      playTts(tts, a ? a.volume : 1);
    }
    return;
  }

  // Start TTS playback — single audio, emotional continuity intact
  const a = document.getElementById('audio');
  const v = a ? a.volume : 1;
  playTts(tts, v);

  // Wait for audio duration, then sync text cues to playback position
  function stopPoll() {
    if (_storyTimer) { clearInterval(_storyTimer); _storyTimer = null; }
  }

  _storyTimer = setInterval(() => {
    if (!_currentTts || !_currentTts.duration) {
      // TTS was killed externally — clean up and bail
      if (!_currentTts) stopPoll();
      return;
    }
    stopPoll();

    const dur = _currentTts.duration;
    let charPos = 0;
    const cues = sentences.map(s => {
      const at = (charPos / story.length) * dur;
      charPos += s.length;
      return { text: s, at };
    });

    let cueIdx = 0;

    // Catch up to any cues already passed while waiting for metadata
    while (cueIdx < cues.length && _currentTts.currentTime >= cues[cueIdx].at - 0.15) {
      showChat(cues[cueIdx].text, false);
      cueIdx++;
    }

    // Poll playback position to trigger remaining cues
    _storyTimer = setInterval(() => {
      if (!_currentTts) { stopPoll(); return; }
      if (cueIdx >= cues.length) { stopPoll(); return; }
      if (_currentTts.currentTime >= cues[cueIdx].at) {
        showChat(cues[cueIdx].text, false);
        cueIdx++;
      }
      if (cueIdx >= cues.length) { stopPoll(); }
    }, 100);
  }, 60);
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
    console.log(`[chat] user msg: "${m.slice(0,40)}..."`);
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
    fetchAI(m, '', true);
  });
  input.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click();});
}
