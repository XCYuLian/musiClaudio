/**
 * Claudio UI — Player Core (src/ui/player.js)
 *
 * Global state, audio pipeline, queue, progress bar, volume, clock.
 * LOADED FIRST — defines shared globals used by chat.js and favs.js.
 */

const $ = s => document.querySelector(s);

// ── State ──
let queue = [], currentIdx = -1, playerState = 'idle', lang = localStorage.getItem('claudio_lang') || 'en';
let chatMessages = [], playHistory = JSON.parse(localStorage.getItem('claudio_history') || '[]');
let _recent = [], _busy = false;

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
  playerState = st;
  const el = $('#np-label-text'); if (el) el.textContent = t(st);
  $('#btn-play').disabled = (st === 'idle');
}

// ── Queue ──
function renderQueue() {
  const c = $('#queue-list'), cnt = $('#queue-count');
  cnt.textContent = queue.length + ' tracks';
  if (!queue.length) { c.innerHTML = '<div class="queue-empty">— 队列为空 —</div>'; return; }
  c.innerHTML = queue.map((t,i) => {
    const act = i === currentIdx, dead = !t.url;
    const cls = act ? 'queue-track active' : (dead?'queue-track dead':'queue-track');
    const dot = act ? '<span class="dot-pulse green sm" style="margin-right:6px"></span>' : '';
    return `<div class="${cls}"><span class="queue-idx">${String(i+1).padStart(2,'0')}</span><div class="queue-body"><div class="qt-title">${dot}${esc(t.label||t.name||'?')}</div></div></div>`;
  }).join('');
  $('#btn-prev').disabled = currentIdx <= 0;
  $('#btn-next').disabled = !queue.length;
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

// ── Audio ──
function playAudio(url) {
  const a = $('#audio'); a.src = url; setPlayerState('ready');
  a.play().catch(()=>{});
  _busy = false;
  addHistory($('#np-title').textContent, $('#np-artist').textContent);
}

function initAudio() {
  const a = $('#audio');
  $('#btn-play').disabled = true;
  $('#btn-play').addEventListener('click', () => {
    if (a.src && !a.src.endsWith('null')) { if (a.paused) a.play().catch(()=>{}); else a.pause(); }
  });
  $('#btn-prev').addEventListener('click', () => skip(-1));
  $('#btn-next').addEventListener('click', () => skip(1));

  a.addEventListener('play', () => { $('#icon-play').style.display='none'; $('#icon-pause').style.display=''; setPlayerState('playing'); });
  a.addEventListener('pause', () => { $('#icon-play').style.display=''; $('#icon-pause').style.display='none'; if (a.src) setPlayerState('ready'); });
  a.addEventListener('ended', () => { autoNext(); });
  a.addEventListener('error', () => { setPlayerState('idle'); autoNext(); });

  let lastSave = 0;
  a.addEventListener('timeupdate', () => {
    if (a.duration && isFinite(a.duration)) {
      const pct = (a.currentTime/a.duration*100);
      if (!_dragging) { $('#progress-fill').style.width = pct+'%'; $('#progress-thumb').style.left = pct+'%'; }
      $('#time-now').textContent = fmtTime(a.currentTime);
      $('#time-total').textContent = fmtTime(a.duration);
    }
    // Pre-fetch at 10s remaining — let refill/fetchAI handle the _busy lock
    if (a.duration && a.duration-a.currentTime < 10 && !_busy) { refill(); }
    // Seek-to-end → skip
    if (a.duration>5 && a.currentTime >= a.duration-0.5) { a.pause(); autoNext(); }
    // Save
    const now = Date.now();
    if (now-lastSave>3000) { lastSave=now; saveState(); }
  });
  initSeek();
}

function autoNext() {
  let ni = currentIdx + 1;
  while (ni < queue.length && !queue[ni]?.url) ni++;
  if (ni < queue.length && queue[ni]?.url) {
    currentIdx = ni; renderQueue();
    const t = queue[currentIdx];
    updatePlayerInfo(t.label||t.name, t.album||'');
    playAudio(t.url);
  } else {
    setPlayerState('idle');
    refill();
  }
}

function skip(dir) {
  if (_busy) return;  // Bug 17/18 fix: block skip when DJ is speaking
  if (!queue.length) return refill();
  let ni = currentIdx + dir;
  while (ni>=0 && ni<queue.length && !queue[ni]?.url) ni += dir;
  if (ni<0) return;
  if (ni>=queue.length) { setPlayerState('idle'); return refill(); }
  currentIdx = ni; renderQueue();
  const t = queue[currentIdx];
  if (t?.url) { updatePlayerInfo(t.label||t.name, t.album||''); playAudio(t.url); }
}

// Marquee guard: only re-render when song actually changes
let _lastTitle = '', _lastArtist = '';

function updatePlayerInfo(title, sub) {
  const titleText = title||'Claudio.fm';
  const subText = sub||'';
  // Skip if same song — prevents timeupdate/etc from resetting CSS animation
  if (titleText === _lastTitle && subText === _lastArtist) return;
  _lastTitle = titleText;
  _lastArtist = subText;

  const tEl = $('#np-title'), sEl = $('#np-artist');
  tEl.title = titleText;
  sEl.title = subText;
  tEl.textContent = titleText;
  sEl.textContent = subText;

  // Wait for layout, then detect overflow and apply marquee
  requestAnimationFrame(() => {
    [tEl, sEl].forEach(el => {
      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow > 4) {
        const text = el.textContent;
        const span = document.createElement('span');
        span.textContent = text;
        el.textContent = '';
        el.appendChild(span);
        const dx = -(el.scrollWidth - el.clientWidth);
        const speed = Math.max(el.scrollWidth / 40, 6);
        span.style.setProperty('--dx', dx + 'px');
        span.style.animation = `marquee ${speed}s linear infinite`;
      }
    });
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
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('claudio_playback')); if (!s?.url) return;
    if (JSON.parse(localStorage.getItem('claudio_playback')||'{}').queue?.length>20) localStorage.removeItem('claudio_playback');
    queue=[{label:s.title,name:s.title,url:s.url}];currentIdx=0;renderQueue();
    updatePlayerInfo(s.title,s.artist);
    const a=$('#audio');a.src=s.url;a.currentTime=s.position||0;setPlayerState('ready');a.play().catch(()=>{});
  } catch {}
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
