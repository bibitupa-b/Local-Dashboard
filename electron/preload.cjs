const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dashboard', {
  quit: () => ipcRenderer.send('app:quit'),
  openDataFolder: () => ipcRenderer.send('app:open-data'),
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
})
