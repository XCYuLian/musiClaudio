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

  // Netease import
  importNetease: (uid, cookie) => ipcRenderer.invoke('netease:import', { uid, cookie }),
  onImportProgress: (callback) => {
    ipcRenderer.on('netease:progress', (_event, data) => callback(data));
  },

  // State
  getNow: () => ipcRenderer.invoke('state:now'),

  // Window controls
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),

  // Listen for scheduler broadcasts
  onBroadcast: (callback) => {
    ipcRenderer.on('dj:broadcast', (_event, data) => callback(data));
  },
});
