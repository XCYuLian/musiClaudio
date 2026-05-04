/**
 * Claudio.fm Player — CLEAN V2
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

// ── Chat ──
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
    // Pre-fetch at 10s remaining
    if (a.duration && a.duration-a.currentTime < 10 && !_busy) { _busy = true; refill(); }
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
  if (!queue.length) return refill();
  let ni = currentIdx + dir;
  while (ni>=0 && ni<queue.length && !queue[ni]?.url) ni += dir;
  if (ni<0) return;
  if (ni>=queue.length) { setPlayerState('idle'); return refill(); }
  currentIdx = ni; renderQueue();
  const t = queue[currentIdx];
  if (t?.url) { updatePlayerInfo(t.label||t.name, t.album||''); playAudio(t.url); }
}

function updatePlayerInfo(title, sub) {
  $('#np-title').textContent = title||'Claudio.fm';
  $('#np-artist').textContent = sub||'';
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

// ── AI Fetch ──
async function fetchAI(msg, hidden) {
  if (_busy) return; _busy = true;
  try {
    const m = hidden ? hidden+'\n'+msg : msg;
    const ctx = _recent.length ? '[最近播放：'+_recent.join(' → ')+']\n'+m : m;
    const res = await window.claudio.sendMessage(ctx);
    if (!res.ok) throw new Error(res.error);
    handleResponse(res);
  } catch(e) { showChat(t('connError'),false); _busy = false; }
}

async function refill() {
  if (_busy) return;
  const h = new Date().getHours();
  const mood = h<6?'深夜':h<9?'清晨':h<12?'上午':h<14?'午后':h<17?'下午':h<19?'傍晚':'夜晚';
  fetchAI(mood+'了，推荐下一首', '');
}

// ── Handle AI response ──
function handleResponse(data) {
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
    // TTS without changing music
    if (ttsFile && ttsFile.startsWith('data:')) {
      const a = document.getElementById('audio');
      const v = a ? a.volume : 1;
      if (a && a.src && !a.src.endsWith('null')) fadeVol(a, v, 0.10, () => {
        const tts = new Audio(ttsFile); tts.volume = v;
        tts.onended = () => { fadeVol(a, a.volume, v); _busy = false; };
        tts.onerror = () => { _busy = false; };
        tts.play().catch(()=>{ _busy = false; });
      });
      else {
        const tts = new Audio(ttsFile); tts.volume = v;
        tts.onended = () => { _busy = false; };
        tts.play().catch(()=>{ _busy = false; });
      }
    } else {
      _busy = false;
    }
    return;
  }

  // change_song → actually play new music
  showChat(djSpeech, hasTracks);
  if (hasTracks) {
    const isAuto = data.type === 'scheduled' || data.trigger === 'startup';
    queue = (isAuto && queue.length) ? [...queue, ...tracks] : tracks;
    if (!isAuto) currentIdx = 0;
    renderQueue();
    const tr = tracks[0];
    updatePlayerInfo(tr.label||tr.name, tr.album||'');
    if (ttsFile && ttsFile.startsWith('data:')) {
      const a = document.getElementById('audio');
      const v = a ? a.volume : 1;
      fadeVol(a, v, 0.10, () => {
        const tts = new Audio(ttsFile); tts.volume = v;
        tts.onended = () => { fadeVol(a, a.volume, v); _busy=false; setTimeout(()=>playAudio(tr.url),400); };
        tts.onerror = () => { _busy=false; playAudio(tr.url); };
        tts.play().catch(()=>{ _busy=false; playAudio(tr.url); });
        setTimeout(()=>{if(!tts.ended){_busy=false;playAudio(tr.url);}},20000);
      });
    } else { _busy = false; playAudio(tr.url); }
  } else {
    _recent.push(query||''); if (_recent.length>10) _recent=_recent.slice(-10);
    showChat(`"${query}" 无原唱音源，换一首`, false); _busy = false;
    setTimeout(refill, 500);
  }
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

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initClock(); initAudio(); initVolume(); initChat(); initLogoTap(); renderQueue(); renderChat(); renderHistory();
  initSettings(); initFavs();
  $('#btn-min').addEventListener('click',()=>window.claudio.minimize());
  $('#btn-close').addEventListener('click',()=>window.claudio.close());
  $('#btn-lang').addEventListener('click',()=>{lang=lang==='en'?'zh':'en';localStorage.setItem('claudio_lang',lang);$('#btn-lang').textContent=lang==='en'?'中文':'EN';updateClock();});
  window.claudio.onBroadcast(data => handleResponse(data));
  setTimeout(loadState, 300);
});

function updateClock() {
  const n=new Date();
  $('#clock-time').textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
  const days=t('days'),months=t('months');
  $('#clock-date').textContent=lang==='zh'?n.getFullYear()+'年'+months[n.getMonth()]+n.getDate()+'日 '+days[n.getDay()]:days[n.getDay()]+' '+String(n.getDate()).padStart(2,'0')+' '+months[n.getMonth()]+' '+n.getFullYear();
}
function initClock() { updateClock(); setInterval(updateClock, 1000); }

// ── Easter egg: command interception ──
const EASTER_TRIGGERS = ['/sudo creator', '你是谁做的', 'who made you', '谁做的'];
function checkEasterEgg(msg) {
  const m = msg.toLowerCase().trim();
  if (EASTER_TRIGGERS.some(t => m.includes(t.toLowerCase()))) {
    const a = document.getElementById('audio');
    if (a && a.src) fadeVol(a, a.volume, 0.10);
    // Grid flash
    const app = document.getElementById('app');
    app.style.filter = 'brightness(1.5)';
    setTimeout(() => app.style.filter = '', 300);
    // Secret message
    const sec = '你触发了隐藏频段。本电台由台长 Galton欣城 于 2026 年无数个熬夜的深夜中构建。祝你今夜好梦。';
    chatMessages.push({ role:'assistant', say:sec, time:fmtNow(), hasTracks:false, isEaster:true });
    renderChat();
    // Play secret voice via system TTS
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
  // Prevent double-click maximize
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
    fetchAI(m,'');
  });
  input.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click();});
}

function initVolume() {
  const s=$('#volume-slider'),a=$('#audio');
  s.value=localStorage.getItem('claudio_volume')||80;a.volume=s.value/100;
  s.addEventListener('input',()=>{a.volume=s.value/100;localStorage.setItem('claudio_volume',s.value);});
}

function initSettings() {
  $('#btn-settings').addEventListener('click',()=>$('#settings-overlay').classList.remove('hidden'));
  $('#btn-settings-close').addEventListener('click',()=>$('#settings-overlay').classList.add('hidden'));
  $('#settings-overlay').addEventListener('click',e=>{if(e.target===$('#settings-overlay'))$('#settings-overlay').classList.add('hidden');});
  $('#btn-import').addEventListener('click',async()=>{
    const uid=$('#import-input').value.trim();if(!uid)return;
    $('#btn-import').disabled=true;$('#btn-import').textContent='Importing...';
    try{const r=await window.claudio.importNetease(uid,'');$('#import-status').textContent=r.ok?r.totalTracks+' tracks imported':r.error;$('#import-status').className='setting-note '+(r.ok?'success':'error');}catch(e){$('#import-status').textContent=e.message;}
    $('#btn-import').disabled=false;$('#btn-import').textContent='IMPORT PLAYLISTS';
  });
}

function initFavs() {
  // Header fav button → open drawer
  const hd = $('#btn-favs');
  if (hd) hd.addEventListener('click',()=>{
    const d=$('#favs-drawer'),list=$('#favs-panel-list');
    const favs=JSON.parse(localStorage.getItem('claudio_favs')||'[]');
    list.innerHTML=favs.length?favs.map((f,i)=>`<div class="favs-panel-item"><span class="fp-idx">${String(i+1).padStart(2,'0')}</span><div class="fp-info"><div class="fp-title">${esc(f.title)}</div>${f.artist?`<div class="fp-artist">${esc(f.artist)}</div>`:''}</div></div>`).join(''):'<div style="color:#555;text-align:center;padding:40px 0">— 暂无红心 —</div>';
    d.classList.remove('hidden');
  });
  $('#favs-close').addEventListener('click',()=>$('#favs-drawer').classList.add('hidden'));
  // Player heart button → toggle like
  const hb = $('#btn-fav');
  if (hb) hb.addEventListener('click',()=>{
    const title=$('#np-title').textContent,artist=$('#np-artist').textContent;
    if(!title||title==='—')return;
    const favs=JSON.parse(localStorage.getItem('claudio_favs')||'[]');
    const idx=favs.findIndex(f=>f.title===title);
    if(idx>=0)favs.splice(idx,1);else favs.unshift({title,artist,time:fmtNow()});
    localStorage.setItem('claudio_favs',JSON.stringify(favs));
    hb.classList.toggle('liked',idx<0);
  });
}
