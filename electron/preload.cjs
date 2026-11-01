const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dashboard', {
  quit: () => ipcRenderer.send('app:quit'),
})
