/**
 * Electron main process — Claudio Desktop Player
 */

// ── Timestamp all console output ──
(function() {
  const _log = console.log, _warn = console.warn, _err = console.error;
  const ts = () => new Date().toISOString().slice(11, 23);
  console.log  = (...a) => _log.call(console,  `[${ts()}]`, ...a);
  console.warn = (...a) => _warn.call(console, `[${ts()}]`, ...a);
  console.error= (...a) => _err.call(console,  `[${ts()}]`, ...a);
})();

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { start: startScheduler, setCallback, triggerNow } = require('./src/core/scheduler');
const { route } = require('./src/core/router');
const state = require('./src/core/state');
const { importPlaylists, importPlaylistById } = require('./src/core/import-netease');
const profiler = require('./src/core/profiler');
const proxy = require('./lib/proxy');
// .env: use unified paths
const { ENV_FILE } = require('./src/core/paths');
const envPath = ENV_FILE;
require('dotenv').config({ path: envPath });

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 900,
    minWidth: 420,
    minHeight: 680,
    frame: false,
    transparent: false,
    icon: app.isPackaged
      ? path.join(path.dirname(app.getPath('exe')), 'resources', 'Crt', 'App icon.png')
      : path.join(__dirname, 'Crt', 'App icon.png'),
    backgroundColor: '#0a0a0a',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'player.html'));

  // Forward renderer console to main process terminal (debugging)
  mainWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log(`[renderer] ${message}`);
  });

  // Window controls via IPC
  ipcMain.on('win:minimize', () => mainWindow.minimize());
  ipcMain.on('win:maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('win:close', () => mainWindow.close());

  // Chat: renderer → backend → back to renderer
  ipcMain.handle('chat:send', async (_event, message) => {
    try {
      state.setPref('last_chat_time', Date.now()); // for DJ proactive idle detection
      const result = await route(message);
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Settings
  ipcMain.handle('settings:get', async () => {
    return {
      model: state.getPref('model') || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      models: [
        { id: 'deepseek-v4-flash', label: 'V4 Flash (快)' },
        { id: 'deepseek-v4-pro', label: 'V4 Pro (强)' },
      ],
    };
  });

  ipcMain.handle('settings:setModel', async (_event, model) => {
    state.setPref('model', model);
    return { ok: true, model };
  });

  ipcMain.handle('settings:getApiKey', async () => {
    const key = process.env.DEEPSEEK_API_KEY || state.getPref('deepseek_api_key') || '';
    return { key };
  });

  ipcMain.handle('settings:setApiKey', async (_event, apiKey) => {
    process.env.DEEPSEEK_API_KEY = apiKey;
    state.setPref('deepseek_api_key', apiKey);
    // Persist to .env for next restart
    try {
      let envContent = '';
      if (require('fs').existsSync(envPath)) {
        envContent = require('fs').readFileSync(envPath, 'utf-8');
      }
      if (/^DEEPSEEK_API_KEY=/m.test(envContent)) {
        envContent = envContent.replace(/^DEEPSEEK_API_KEY=.*$/m, `DEEPSEEK_API_KEY=${apiKey}`);
      } else {
        envContent = envContent.trimEnd() + `\nDEEPSEEK_API_KEY=${apiKey}\n`;
      }
      require('fs').writeFileSync(envPath, envContent, 'utf-8');
    } catch (e) {
      console.error('[settings] Failed to write .env:', e.message);
    }
    return { ok: true };
  });

  // Volcengine TTS settings
  ipcMain.handle('settings:getVolc', async () => ({
    appid: state.getPref('volc_appid') || process.env.VOLC_APPID || '',
    token: state.getPref('volc_token') || process.env.VOLC_TOKEN || '',
  }));
  ipcMain.handle('settings:setVolc', async (_event, { appid, token }) => {
    state.setPref('volc_appid', appid);
    state.setPref('volc_token', token);
    return { ok: true };
  });

  // State
  ipcMain.handle('state:now', async () => {
    const recent = state.getRecentPlays(1);
    return { nowPlaying: recent[0] || null };
  });

  // Saved playlist (local archive)
  ipcMain.handle('state:getSavedPlaylist', async () => {
    const p = path.join(path.dirname(app.getPath('exe')), 'data', 'playlists', 'liked_songs.json');
    // Also check old location for migration
    if (!require('fs').existsSync(p)) {
      const legacyP = path.join(__dirname, 'user', 'netease', 'liked_songs.json');
      if (require('fs').existsSync(legacyP)) {
        require('fs').mkdirSync(path.dirname(p), { recursive: true });
        require('fs').copyFileSync(legacyP, p);
      }
    }
    try {
      if (require('fs').existsSync(p)) {
        const tracks = JSON.parse(require('fs').readFileSync(p, 'utf-8'));
        return { ok: true, tracks, count: tracks.length };
      }
    } catch { /* not found or corrupt */ }
    return { ok: false, tracks: [], count: 0 };
  });

  ipcMain.handle('state:getSavedUid', async () => {
    return { uid: state.getPref('netease_uid') || '' };
  });

  // Netease import
  ipcMain.handle('netease:import', async (_event, { uid, cookie }) => {
    try {
      const savedUid = uid || state.getPref('netease_uid') || process.env.NETEASE_UID;
      if (!savedUid) return { ok: false, error: '请先填写网易云用户 ID' };

      const savedCookie = cookie || state.getPref('netease_cookie') || process.env.NETEASE_COOKIE || '';

      const result = await importPlaylists(savedUid, savedCookie, {}, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('netease:progress', progress);
        }
      });

      // Save UID to state
      state.setPref('netease_uid', savedUid);
      state.setPref('netease_playlists_updated', new Date().toISOString());

      // Regenerate Soul DNA
      profiler.generate().catch(e => console.error('[profiler]', e.message));

      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Smart refill — trigger when queue is low
  ipcMain.handle('queue:refill', async () => {
    try {
      const hour = new Date().getHours();
      await triggerNow('refill', `(auto-refill) 队列快空了，请推荐 3-5 首歌补充进来。现在${hour}点，根据当前时间和用户品味推荐。`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ── VOX Voice switching ──
  const { getVoiceProfiles, getCurrentVoiceId, setCurrentVoiceId } = require('./src/api/tts');
  ipcMain.handle('vox:getVoices', async () => {
    return { profiles: getVoiceProfiles(), current: getCurrentVoiceId() };
  });
  ipcMain.handle('vox:setVoice', async (_event, voiceId) => {
    setCurrentVoiceId(voiceId);
    return { ok: true };
  });

  // ── Lyrics ──
  ipcMain.handle('lyric:get', async (_event, trackId) => {
    try {
      const { getLyric } = require('./src/api/netease');
      const lrc = await getLyric(trackId);
      return { ok: true, lrc };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── V2.8 Storyteller ──
  const { buildStoryPrompt, buildSimplePrompt } = require('./src/core/storyteller');
  ipcMain.handle('story:tell', async (_event, trackLabel, lyricSnippet) => {
    try {
      const hour = new Date().getHours();
      const prompt = buildStoryPrompt(trackLabel, { hour, lyricSnippet });
      const { askDeepSeek } = require('./src/api/deepseek');
      const { synthesize } = require('./src/api/tts');

      // Call DeepSeek with storytelling prompt
      const result = await askDeepSeek(
        '你是深夜电台 DJ。输出 JSON: {"dj_speech": "口播内容", "action_type": "chat_only", "search_query": null}',
        prompt,
        { temperature: 0.85, maxTokens: 1024 }
      );
      const story = result.dj_speech || result.speech || '';

      // Single TTS for emotional continuity
      let tts = null;
      if (story) {
        try {
          const path = await synthesize(story);
          if (path) tts = 'data:audio/mp3;base64,' + require('fs').readFileSync(path).toString('base64');
        } catch {}
      }

      return { ok: true, story, tts };
    } catch (e) {
      return { ok: false, story: '', tts: null };
    }
  });

  // ── Verify login status on startup ──
  const { getLoginStatus } = require('./src/api/netease');
  getLoginStatus().then(profile => {
    if (profile?.nickname) {
      state.setPref('netease_nickname', profile.nickname);
      if (profile.nickname === '秋夢伴点星') {
        console.log('[auth] 欢迎台长归位，无限 Token 权限已自动激活。');
      }
    }
  }).catch(() => {});

  // ── Auth: Netease QR login (non-blocking single ops) ──
  const { getLoginQrCode, checkQrStatus, saveCookie } = require('./src/api/auth');

  ipcMain.handle('auth:checkLogin', async () => {
    const cookie = state.getPref('netease_cookie') || '';
    const nickname = state.getPref('netease_nickname') || '';
    return { loggedIn: !!cookie, nickname };
  });

  ipcMain.handle('auth:getQrCode', async () => {
    try {
      const { key, qrimg } = await getLoginQrCode();
      return { ok: true, key, qrimg };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('auth:checkQrStatus', async (_event, key) => {
    try {
      const result = await checkQrStatus(key);
      if (result.code === 803 && result.cookie) {
        saveCookie(result.cookie);
        // Fetch liked songs sample for personalized recommendations
        const { getLoginStatus, getLikedSongs, getSongDetail } = require('./src/api/netease');
        const profile = await getLoginStatus().catch(() => null);
        if (profile?.userId) {
          state.setPref('netease_nickname', profile.nickname || '');
          if (profile.nickname === '秋夢伴点星') {
            console.log('[auth] 欢迎台长归位，无限 Token 权限已自动激活。');
          }
          const ids = await getLikedSongs(profile.userId, 10);
          if (ids.length) {
            try {
              const songs = await getSongDetail(ids.slice(0, 5));
              const sample = songs.map(s => s.label || s.name).join(', ');
              state.setPref('liked_songs_sample', sample);
            } catch {}
          }
        }
      }
      return result;
    } catch (e) {
      return { code: -1, message: e.message };
    }
  });

  // Proxy status for renderer
  ipcMain.handle('proxy:ping', async () => {
    const alive = await proxy.ping();
    return { ok: alive, port: proxy.getPort() };
  });

  ipcMain.handle('api:ping', async () => {
    try {
      const { ping } = require('./src/api/netease');
      const result = await ping();
      return { ok: result.ok, source: result.source || 'unknown' };
    } catch { return { ok: false }; }
  });

  // Single playlist import (by ID or share link)
  ipcMain.handle('netease:importPlaylist', async (_event, playlistId) => {
    try {
      if (!playlistId) return { ok: false, error: 'No playlist ID provided' };
      const cookie = state.getPref('netease_cookie') || process.env.NETEASE_COOKIE || '';

      const result = await importPlaylistById(playlistId, cookie, {}, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('netease:progress', progress);
        }
      });

      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// ── Scheduler callback → push to renderer ──
function pushToRenderer(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dj:broadcast', data);
  }
}

// Bug 3 fix: bypass Chrome autoplay restriction
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  await state.init();
  createWindow();

  // Start scheduler, push to UI
  setCallback((result) => {
    if (result) pushToRenderer(result);
  });
  startScheduler();

  // Bug 3 fix: renderer signals ready → start cold boot
  ipcMain.handle('app:ready', async () => {
    const hour = new Date().getHours();
    const greeting = hour < 6 ? '深夜了，来点 ambient 氛围音乐。'
      : hour < 9 ? '早上好！新的一天开始了，来点清晨音乐。'
      : hour < 12 ? '上午好！开始工作了，放点专注音乐。'
      : hour < 14 ? '午餐时间，来点轻松的。'
      : hour < 17 ? '下午好！需要提振精神吗？'
      : hour < 19 ? '傍晚了，切换到放松模式。'
      : '晚上好！放点舒缓的音乐。';
    triggerNow('startup', `(auto-boot) ${greeting} 根据现在的时间和我的口味，自动推荐一个播放列表。`).catch(err => {
      console.error('[auto-start] Failed:', err.message);
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:loadState');
    }
    return { ok: true };
  });

  // Start proxy only for non-VIP users (VIP uses official API directly)
  const hasCookie = state.getPref('netease_cookie');
  if (!hasCookie) {
    proxy.start();
  } else {
    console.log('[proxy] Skipped — VIP user, using official API direct connect');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  proxy.stop();
  app.quit();
});
