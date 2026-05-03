/**
 * Electron main process — Claudio Desktop Player
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { start: startScheduler, setCallback } = require('./lib/scheduler');
const { route } = require('./lib/router');
const state = require('./lib/state');
// .env: in dev use project root, in prod look next to exe
const envPath = app.isPackaged
  ? path.join(path.dirname(app.getPath('exe')), '.env')
  : path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 700,
    minWidth: 360,
    minHeight: 600,
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

  // State
  ipcMain.handle('state:now', async () => {
    const recent = state.getRecentPlays(1);
    return { nowPlaying: recent[0] || null };
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray (future)
  app.quit();
});
