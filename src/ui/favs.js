/**
 * Claudio UI — Favorites + Settings + Init (src/ui/favs.js)
 *
 * Favorite collection side drawer, settings panel, import, language toggle,
 * window controls, and the master DOMContentLoaded init.
 * LOADED LAST — orchestrates all components after player.js and chat.js globals are defined.
 */

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

// ── Status Ticker: single static message ──
function initTicker() {
  const el = $('#ticker-text');
  if (el) el.textContent = 'Claudio.fm — Personal AI Radio';
}

// ── Master Init ──
document.addEventListener('DOMContentLoaded', () => {
  initClock(); initDataDrift(); initTicker(); initAudio(); initVisualizer(); initVolume(); initChat(); initLogoTap(); renderChat(); renderHistory();
  initSettings(); initFavs();
  $('#btn-min').addEventListener('click',()=>window.claudio.minimize());
  $('#btn-max').addEventListener('click',()=>window.claudio.maximize());
  $('#btn-close').addEventListener('click',()=>window.claudio.close());
  $('#btn-lang').addEventListener('click',()=>{lang=lang==='en'?'zh':'en';localStorage.setItem('claudio_lang',lang);$('#btn-lang').textContent=lang==='en'?'中文':'EN';updateClock();});
  window.claudio.onBroadcast(data => handleResponse(data));
  // Bug 3 fix: listen for main process loadState signal instead of blind setTimeout
  window.claudio.onLoadState(() => { loadState(); });
  // Bug 3 fix: notify main process DOM is ready → triggers auto-start with app_start intent
  window.claudio.notifyReady();
});
