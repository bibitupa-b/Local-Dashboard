const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dashboard', {
  quit: () => ipcRenderer.send('app:quit'),
  openDataFolder: () => ipcRenderer.send('app:open-data'),
})
