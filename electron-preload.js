/**
 * Preload script — exposes safe IPC bridge to renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudio', {
  // Chat
  sendMessage: (msg) => ipcRenderer.invoke('chat:send', msg),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setModel: (model) => ipcRenderer.invoke('settings:setModel', model),
  getApiKey: () => ipcRenderer.invoke('settings:getApiKey'),
  setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),
  getVolc: () => ipcRenderer.invoke('settings:getVolc'),
  setVolc: (appid, token) => ipcRenderer.invoke('settings:setVolc', { appid, token }),

  // Netease import
  importNetease: (uid, cookie) => ipcRenderer.invoke('netease:import', { uid, cookie }),
  importPlaylist: (playlistId) => ipcRenderer.invoke('netease:importPlaylist', playlistId),
  onImportProgress: (callback) => {
    ipcRenderer.on('netease:progress', (_event, data) => callback(data));
  },

  // State
  getNow: () => ipcRenderer.invoke('state:now'),
  getSavedPlaylist: () => ipcRenderer.invoke('state:getSavedPlaylist'),
  getSavedUid: () => ipcRenderer.invoke('state:getSavedUid'),

  // Window controls
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  // API service management
  pingApi: () => ipcRenderer.invoke('api:ping'),
  pingProxy: () => ipcRenderer.invoke('proxy:ping'),
  refillQueue: () => ipcRenderer.invoke('queue:refill'),

  // Listen for scheduler broadcasts
  onBroadcast: (callback) => {
    ipcRenderer.on('dj:broadcast', (_event, data) => callback(data));
  },

  // Bug 3 fix: cold start — notify main process DOM is ready
  notifyReady: () => ipcRenderer.invoke('app:ready'),
  onLoadState: (callback) => {
    ipcRenderer.on('app:loadState', () => callback());
  },

  // Auth: Netease QR login (non-blocking single ops)
  checkLogin: () => ipcRenderer.invoke('auth:checkLogin'),
  getQrCode: () => ipcRenderer.invoke('auth:getQrCode'),
  checkQrStatus: (key) => ipcRenderer.invoke('auth:checkQrStatus', key),

  // Lyrics
  getLyric: (trackId) => ipcRenderer.invoke('lyric:get', trackId),

  // V2.8 Storyteller
  tellStory: (trackLabel, lyricSnippet) => ipcRenderer.invoke('story:tell', trackLabel, lyricSnippet),

  // VOX Voice switching
  getVoices: () => ipcRenderer.invoke('vox:getVoices'),
  setVoice: (voiceId) => ipcRenderer.invoke('vox:setVoice', voiceId),
});
