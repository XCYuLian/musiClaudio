/**
 * Electron main process — Claudio Desktop Player
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { start: startScheduler, setCallback, triggerNow } = require('./lib/scheduler');
const { route } = require('./lib/router');
const state = require('./lib/state');
const { importPlaylists, importPlaylistById } = require('./lib/import-netease');
const profiler = require('./lib/profiler');
const proxy = require('./lib/proxy');
// .env: use unified paths
const { ENV_FILE } = require('./lib/paths');
const envPath = ENV_FILE;
require('dotenv').config({ path: envPath });

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 780,
    minWidth: 380,
    minHeight: 680,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'player.html'));

  // Window controls via IPC
  ipcMain.on('win:minimize', () => mainWindow.minimize());
  ipcMain.on('win:maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('win:close', () => mainWindow.close());

  // Chat: renderer → backend → back to renderer
  ipcMain.handle('chat:send', async (_event, message) => {
    try {
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

  // Proxy status for renderer
  ipcMain.handle('proxy:ping', async () => {
    const alive = await proxy.ping();
    return { ok: alive, port: proxy.getPort() };
  });

  ipcMain.handle('api:ping', async () => {
    try {
      const { ping } = require('./lib/ncm');
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

app.whenReady().then(async () => {
  await state.init();
  createWindow();

  // Start scheduler, push to UI
  setCallback((result) => {
    if (result) pushToRenderer(result);
  });
  startScheduler();

  // Auto-start AI DJ on launch (slight delay for window to load)
  setTimeout(() => {
    const apiKey = process.env.DEEPSEEK_API_KEY || state.getPref('deepseek_api_key') || '';
    if (!apiKey) {
      pushToRenderer({
        type: 'system',
        say: 'Welcome to Claudio.fm! Set your DeepSeek API key in Settings to get started.',
        reason: '请在设置（SET）中填入 DeepSeek API 密钥，我就能为你推荐音乐了。',
      });
      return;
    }
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
      pushToRenderer({
        type: 'system',
        say: `Auto-start failed: ${err.message}`,
        reason: `自启失败：${err.message}。请检查 API Key 是否正确。`,
      });
    });
  }, 2000);

  // Start UnblockNeteaseMusic proxy for VIP track unlocking
  proxy.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  proxy.stop();
  app.quit();
});
