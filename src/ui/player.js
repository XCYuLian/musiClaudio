/**
 * Claudio UI — Player Core (src/ui/player.js)
 *
 * Global state, audio pipeline, lyrics, progress bar, volume, clock.
 * LOADED FIRST — defines shared globals used by chat.js and favs.js.
 */

// ── Timestamp all console output ──
(function() {
  const _log = console.log, _warn = console.warn, _err = console.error;
  const ts = () => new Date().toISOString().slice(11, 23);
  console.log  = (...a) => _log.call(console,  `[${ts()}]`, ...a);
  console.warn = (...a) => _warn.call(console, `[${ts()}]`, ...a);
  console.error= (...a) => _err.call(console,  `[${ts()}]`, ...a);
})();

const $ = s => document.querySelector(s);

// ── State ──
let currentTrack = null, playerState = 'idle', lang = localStorage.getItem('claudio_lang') || 'en';
let chatMessages = [], playHistory = JSON.parse(localStorage.getItem('claudio_history') || '[]');
let _recent = [], _busy = false;
let _lyricLines = [];  // parsed LRC array
// One-shot flags for timeupdate state transitions (reset on play)
let _loggedMid = false, _logged10s = false, _prefetchFired = false, _midStoryFired = false, _seekFired = false, _autoNextFired = false;

// ── i18n ──
const T = {
  en: {
    idle:'IDLE',ready:'READY',playing:'PLAYING',connError:'Connection failed. Check .env config.',
    trackError:'Track unavailable, switching...',unavailable:'No playable source',
    days:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    months:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
  },
  zh: {
    idle:'待机',ready:'就绪',playing:'播放中',connError:'连接失败，请检查配置',
    trackError:'音源不可用，自动切换中',unavailable:'无法获取播放源',
    days:['星期日','星期一','星期二','星期三','星期四','星期五','星期六'],
    months:['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  }
};
function t(k) { return T[lang]?.[k] || T.en[k] || k; }

// ── Helpers ──
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtNow() { const n = new Date(); return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'); }
function fmtTime(s) { const m = Math.floor(s/60), sec = Math.floor(s%60); return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'); }

// ── Player state ──
function setPlayerState(st) {
  console.log(`[player] state ${playerState}→${st} _busy=${_busy} _coldBooting=${_coldBooting}`);
  playerState = st;
  const el = $('#np-label-text'); if (el) el.textContent = t(st);
  $('#btn-play').disabled = (st === 'idle');
}

// ── Lyrics (Browser-side LRC parser) ──
function parseLRC(lrc) {
  if (!lrc) return [];
  const lines = [];
  const timeRe = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;
  for (const raw of lrc.split('\n')) {
    const text = raw.replace(/\[\d{2}:\d{2}[.:]\d{2,3}\]/g, '').trim();
    if (!text) continue;
    const re = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;
    let m;
    while ((m = re.exec(raw))) {
      const min = parseInt(m[1]), sec = parseInt(m[2]);
      let ms = parseInt(m[3]);
      if (m[3].length === 2) ms *= 10;
      lines.push({ time: min * 60 + sec + ms / 1000, text });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

async function loadLyric(trackId) {
  _lyricLines = [];
  if (!trackId) { console.log('[player] lyric skip: no trackId'); renderLyricLines(); return; }
  try {
    const raw = await window.claudio.getLyric(trackId);
    _lyricLines = raw?.lrc?.lyric ? parseLRC(raw.lrc.lyric) : [];
    console.log(`[player] lyric loaded: ${_lyricLines.length} lines, trackId=${trackId}`);
  } catch (e) { console.warn(`[player] lyric fail: ${e.message}`); _lyricLines = []; }
  renderLyricLines();
}

function renderLyricLines() {
  const container = $('#lyric-lines');
  if (!container) return;
  if (!_lyricLines.length) {
    container.innerHTML = '<div class="lyric-placeholder">— 纯音乐，请欣赏 —</div>';
    return;
  }
  container.innerHTML = _lyricLines.map((l, i) =>
    `<div class="lyric-line" data-idx="${i}">${esc(l.text)}</div>`
  ).join('');
}

function updateLyricHighlight(currentTime) {
  if (!_lyricLines.length) return;
  let idx = -1;
  for (let i = 0; i < _lyricLines.length; i++) {
    if (_lyricLines[i].time <= currentTime + 0.3) idx = i;
    else break;
  }
  const panel = $('#lyric-panel');
  const lines = document.querySelectorAll('.lyric-line');
  lines.forEach((el, i) => {
    el.classList.remove('active', 'past');
    if (i < idx) el.classList.add('past');
    if (i === idx) {
      el.classList.add('active');
      // Smooth scroll: use container scrollTop instead of scrollIntoView
      if (panel) {
        const offset = el.offsetTop - panel.clientHeight / 2 + el.clientHeight / 2;
        panel.scrollTo({ top: offset, behavior: 'smooth' });
      }
    }
  });
}

// ── Progress bar seeking ──
let _dragging = false;
function initSeek() {
  const track = $('#progress-track');
  const thumb = $('#progress-thumb');
  const hover = $('#hover-time');
  const a = $('#audio');

  const getPct = (e) => { const r = track.getBoundingClientRect(); const x = e.clientX - r.left; return Math.max(0, Math.min(100, (x/r.width)*100)); };

  track.addEventListener('mousedown', (e) => {
    _dragging = true; track.classList.add('dragging');
    const pct = getPct(e); if (a.duration) a.currentTime = (pct/100) * a.duration;
  });
  document.addEventListener('mousemove', (e) => {
    if (!_dragging) {
      if (a.duration && track.matches(':hover')) { const pct = getPct(e); hover.textContent = fmtTime((pct/100)*a.duration); hover.style.left = pct+'%'; hover.classList.add('visible'); }
      else hover.classList.remove('visible');
      return;
    }
    const pct = getPct(e); if (a.duration) a.currentTime = (pct/100) * a.duration;
  });
  document.addEventListener('mouseup', () => { if (_dragging) { _dragging = false; track.classList.remove('dragging'); saveState(); } });
}

// ── Spectrum Visualizer ──
let _audioCtx = null, _analyser = null, _visAnim = null;

function initVisualizer() {
  const canvas = $('#visualizer-bar');
  if (!canvas) return;
  const a = $('#audio');
  if (!a) return;

  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!_analyser) {
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = 128;
      const source = _audioCtx.createMediaElementSource(a);
      source.connect(_analyser);
      _analyser.connect(_audioCtx.destination);
    }
    drawVisualizer(canvas);
  } catch (e) {
    // MediaElementSource can only be created once per audio element
  }
}

function drawVisualizer(canvas) {
  if (!_analyser) return;
  const ctx = canvas.getContext('2d');
  const bufLen = _analyser.frequencyBinCount;
  const data = new Uint8Array(bufLen);
  const W = canvas.width = canvas.offsetWidth || 300;
  const H = canvas.height = canvas.offsetHeight || 48;
  const barW = W / 48;  // 48 bars

  function draw() {
    _visAnim = requestAnimationFrame(draw);
    _analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < 48; i++) {
      const v = data[Math.floor(i * bufLen / 48)] / 255;
      const h = v * H * 0.9;
      const x = i * barW;
      const grad = ctx.createLinearGradient(x, H, x, H - h);
      grad.addColorStop(0, 'rgba(105,240,174,0.3)');
      grad.addColorStop(1, 'rgba(105,240,174,0.7)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.5 + v * 0.5;
      ctx.fillRect(x + 1, H - h, barW - 2, h);
    }
  }
  draw();
}

// ── Audio ──
function playAudio(url) {
  console.log(`[player] playAudio url=${url?.slice(0,60)}... _busy=${_busy} _nextTrack=${!!(typeof _nextTrack!=='undefined'&&_nextTrack)}`);
  // Release previous animation frame
  if (_visAnim) { cancelAnimationFrame(_visAnim); _visAnim = null; }
  const a = $('#audio'); a.src = url; setPlayerState('ready');
  // Restart spectrum visualizer (was killed by cancelAnimationFrame above)
  if (_analyser) {
    const canvas = $('#visualizer-bar');
    if (canvas) drawVisualizer(canvas);
  }
  a.play().catch(()=>{});
  _busy = false;
  const label = $('#np-title').textContent + ' - ' + $('#np-artist').textContent;
  addHistory($('#np-title').textContent, $('#np-artist').textContent);
  // Start prefetch + story sequentially (avoids concurrent DeepSeek calls)
  if (typeof _nextTrack !== 'undefined') _nextTrack = null;
  (async () => {
    if (typeof prefetchNext === 'function') await prefetchNext();
    if (typeof startBackgroundStory === 'function') startBackgroundStory(label);
  })();
}

function initAudio() {
  const a = $('#audio');
  $('#btn-play').disabled = true;
  $('#btn-play').addEventListener('click', () => {
    if (a.src && !a.src.endsWith('null')) { if (a.paused) a.play().catch(()=>{}); else a.pause(); }
  });
  $('#btn-prev').addEventListener('click', () => { if (!_busy) refill(); });
  $('#btn-next').addEventListener('click', () => { if (!_busy) refill(); });

  a.addEventListener('play', () => { _loggedMid = false; _logged10s = false; _prefetchFired = false; _midStoryFired = false; _seekFired = false; _autoNextFired = false; $('#icon-play').style.display='none'; $('#icon-pause').style.display=''; setPlayerState('playing'); });
  a.addEventListener('pause', () => { $('#icon-play').style.display=''; $('#icon-pause').style.display='none'; if (a.src && playerState === 'playing') setPlayerState('ready'); });
  a.addEventListener('ended', () => { if (_autoNextFired) return; console.log('[player] audio ended → autoNext'); autoNext(); });
  a.addEventListener('error', () => { if (_autoNextFired) return; console.warn('[player] audio error → autoNext'); setPlayerState('idle'); autoNext(); });

  let lastSave = 0;
  a.addEventListener('timeupdate', () => {
    if (a.duration && isFinite(a.duration)) {
      const pct = (a.currentTime/a.duration*100);
      if (!_dragging) { $('#progress-fill').style.width = pct+'%'; $('#progress-thumb').style.left = pct+'%'; }
      $('#time-now').textContent = fmtTime(a.currentTime);
      $('#time-total').textContent = fmtTime(a.duration);
    }
    // Lyric highlight
    updateLyricHighlight(a.currentTime);
    // V2.8: Mid-song story check (~40-65% of song) — fire once per track
    if (a.duration && a.currentTime > a.duration * 0.4 && a.currentTime < a.duration * 0.65 && !_busy && !_midStoryFired) {
      if (!_loggedMid) { _loggedMid = true; console.log(`[player] mid-story trigger t=${a.currentTime.toFixed(1)}s`); }
      _midStoryFired = true;
      if (typeof checkMidStory === 'function') checkMidStory();
    }
    // Backup prefetch at 10s — fire once per track
    if (a.duration && a.duration-a.currentTime < 10 && !_busy && !_prefetchFired) {
      if (!_logged10s) { _logged10s = true; console.log(`[player] 10s prefetch trigger t=${a.currentTime.toFixed(1)}s remaining=${(a.duration-a.currentTime).toFixed(1)}s`); }
      _prefetchFired = true;
      if (typeof prefetchNext === 'function') prefetchNext();
    }
    // Seek-to-end → skip (one-shot: fire once per track end)
    if (a.duration>5 && a.currentTime >= a.duration-0.5 && !_seekFired) {
      _seekFired = true;
      console.log(`[player] seek-to-end t=${a.currentTime.toFixed(1)}s → autoNext`);
      a.pause(); autoNext();
    }
    // Save
    const now = Date.now();
    if (now-lastSave>3000) { lastSave=now; saveState(); }
  });
  initSeek();
}

function autoNext() {
  if (_autoNextFired) { console.log('[player] autoNext blocked: already fired'); return; }
  _autoNextFired = true;
  setPlayerState('idle');
  if (_coldBooting) { console.log('[player] autoNext blocked: cold booting'); return; }
  // Prefetched track ready → play instantly, no AI wait
  if (typeof _nextTrack !== 'undefined' && _nextTrack) {
    console.log('[player] autoNext → prefetched track');
    const data = _nextTrack;
    _nextTrack = null;
    if (typeof handleResponse === 'function') handleResponse(data);
    return;
  }
  console.log('[player] autoNext → refill');
  refill();
}

// Marquee guard: only re-render when song actually changes
let _lastTitle = '', _lastArtist = '', _lastTrackId = '';

function updatePlayerInfo(title, sub, trackId) {
  const titleText = title||'Claudio.fm';
  const subText = sub||'';
  if (titleText === _lastTitle && subText === _lastArtist) return;
  _lastTitle = titleText;
  _lastArtist = subText;

  if (trackId && trackId !== _lastTrackId) {
    _lastTrackId = trackId;
    loadLyric(trackId);
  } else if (!trackId) {
    _lastTrackId = '';
    _lyricLines = [];
    renderLyricLines();
  }

  const tEl = $('#np-title'), sEl = $('#np-artist');
  // Clear previous animations
  [tEl, sEl].forEach(el => {
    el.classList.remove('float', 'marquee');
    el.textContent = '';
    el.style.animation = '';
  });
  tEl.title = titleText;
  sEl.title = subText;
  tEl.textContent = titleText;
  sEl.textContent = subText;

  // Force layout, then decide: float (short) or marquee (long)
  void tEl.offsetHeight;  // force reflow
  [tEl, sEl].forEach(el => {
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow > 2) {
      // Long text → marquee scroll
      const text = el.textContent;
      const span = document.createElement('span');
      span.textContent = text;
      el.textContent = '';
      el.appendChild(span);
      const dx = -(el.scrollWidth - el.clientWidth);
      const speed = Math.max(el.scrollWidth / 45, 8);
      span.style.setProperty('--dx', dx + 'px');
      span.style.animation = `marquee ${speed}s linear infinite`;
    } else {
      // Short text → float sway
      el.classList.add('float');
    }
  });
}

// ── History ──
function addHistory(title, artist) {
  if (!title||title==='—') return;
  playHistory = playHistory.filter(h=>h.title!==title);
  playHistory.unshift({title,artist,time:fmtNow()});
  if (playHistory.length>20) playHistory = playHistory.slice(0,20);
  localStorage.setItem('claudio_history', JSON.stringify(playHistory));
  _recent.push(title+' — '+artist); if (_recent.length>10) _recent=_recent.slice(-10);
  renderHistory();
}
function renderHistory() {
  const c = $('#history-list');
  if (!playHistory.length) { c.innerHTML=''; return; }
  c.innerHTML = '<div class="history-head">RECENT</div>'+playHistory.slice(0,5).map(h=>`<div class="history-item"><span class="hi-time">${h.time}</span><span class="hi-title">${esc(h.title)}${h.artist?' — '+esc(h.artist):''}</span></div>`).join('');
}

// ── Save/Load ──
function saveState() {
  const a = $('#audio'); if (!a.src||a.src.endsWith('null')) return;
  localStorage.setItem('claudio_playback', JSON.stringify({url:a.src,title:$('#np-title').textContent,artist:$('#np-artist').textContent,position:a.currentTime}));
}
let _coldBooting = true;  // suppress autoNext during cold start recovery

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('claudio_playback')); if (!s?.url) { console.log('[player] loadState: no saved state'); return; }
    console.log(`[player] loadState: resuming "${s.title}" @ ${s.position?.toFixed(1)||0}s`);
    currentTrack = { label: s.title, name: s.title, url: s.url };
    updatePlayerInfo(s.title, s.artist);
    const a=$('#audio');a.src=s.url;a.currentTime=s.position||0;setPlayerState('ready');a.play().catch(()=>{});
  } catch (e) { console.warn('[player] loadState error:', e.message); }
}

// ── Data Drift — floating status labels in clock background ──
const DRIFT_LABELS = ['TOKEN:∞', 'MODE:NICHE', 'VIP:LOSSLESS', 'SEARCH:ON', 'DNA:70/30', 'STATUS:LIVE'];
let _driftParticles = [];

function initDataDrift() {
  const canvas = $('#data-drift');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth;
  const H = canvas.height = canvas.offsetHeight;
  // Create floating label particles
  _driftParticles = DRIFT_LABELS.map((text, i) => ({
    text, x: Math.random() * W, y: 30 + Math.random() * (H - 60),
    vx: 0.15 + Math.random() * 0.3, vy: 0.05 + Math.random() * 0.1,
  }));

  function drift() {
    ctx.clearRect(0, 0, W, H);
    ctx.font = '10px Consolas, monospace';
    ctx.textBaseline = 'middle';
    _driftParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x > W + 40) p.x = -80;
      if (p.x < -80) p.x = W + 40;
      if (p.y > H) p.y = 0;
      if (p.y < 0) p.y = H;
      ctx.fillStyle = 'rgba(168,85,247,0.35)';
      ctx.fillText(p.text, p.x, p.y);
    });
    requestAnimationFrame(drift);
  }
  drift();
}

// ── Clock ──
function updateClock() {
  const n=new Date();
  $('#clock-time').textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
  const days=t('days'),months=t('months');
  $('#clock-date').textContent=lang==='zh'?n.getFullYear()+'年'+months[n.getMonth()]+n.getDate()+'日 '+days[n.getDay()]:days[n.getDay()]+' '+String(n.getDate()).padStart(2,'0')+' '+months[n.getMonth()]+' '+n.getFullYear();
}
function initClock() { updateClock(); setInterval(updateClock, 1000); }

// ── Volume ──
function initVolume() {
  const s=$('#volume-slider'),a=$('#audio');
  s.value=localStorage.getItem('claudio_volume')||80;a.volume=s.value/100;
  s.addEventListener('input',()=>{a.volume=s.value/100;localStorage.setItem('claudio_volume',s.value);});
}

// ── Cold boot: resume last track immediately, AI comes later ──
setTimeout(() => { console.log('[player] cold boot: loading saved state'); loadState(); _coldBooting = true; }, 100);
setTimeout(() => { if (_coldBooting) console.log('[player] cold boot timeout: forcing _coldBooting=false'); _coldBooting = false; }, 15000);  // safety: clear after 15s
