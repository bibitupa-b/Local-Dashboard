const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  nativeImage,
  dialog,
  shell,
  ipcMain,
  globalShortcut,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.setName('Local Dashboard')
app.setAppUserModelId('com.bibitupa.localdashboard')

const root = path.join(__dirname, '..')
const iconPath = path.join(root, 'assets', 'icon.png')
const trayIconPath = path.join(root, 'assets', 'icon-tray.png')
const isDev = !app.isPackaged
const dataDir = isDev ? path.join(root, 'data') : path.join(app.getPath('userData'), 'data')

function migrateData() {
  if (isDev) return
  const source = path.join(root, 'data')
  if (fs.existsSync(dataDir) || !fs.existsSync(source)) return
  fs.mkdirSync(path.dirname(dataDir), { recursive: true })
  fs.cpSync(source, dataDir, { recursive: true })
  console.log('[desktop] migrated data to', dataDir)
}

migrateData()

let server = null
let win = null
let splash = null
let splashShownAt = 0
let tray = null
let quitting = false
let hideNoticeShown = false
let baseUrl = ''

function showWindow() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function notify(title, message) {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title, body: message, icon: iconPath })
  notification.on('click', showWindow)
  notification.show()
}

function createSplash() {
  splash = new BrowserWindow({
    width: 440,
    height: 330,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  splashShownAt = Date.now()
  void splash.loadFile(path.join(__dirname, 'splash.html'))
}

function closeSplash() {
  if (splash && !splash.isDestroyed()) splash.close()
  splash = null
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#15191A',
    icon: iconPath,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })
  win.webContents.once('did-finish-load', () => {
    const wait = Math.max(0, 900 - (Date.now() - splashShownAt))
    setTimeout(() => {
      closeSplash()
      win.show()
    }, wait)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|obsidian|mailto):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(baseUrl)) return
    event.preventDefault()
    if (/^(https?|obsidian|mailto):/i.test(url)) void shell.openExternal(url)
  })
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
    if (!hideNoticeShown) {
      hideNoticeShown = true
      notify(
        'Local Dashboard',
        'Still running in the tray. Right-click the tray icon and choose Quit to exit.',
      )
    }
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'q') {
      event.preventDefault()
      quitApp()
    }
  })
  void win.loadURL(baseUrl)
}

async function callApi(route, method = 'POST') {
  const response = await fetch(`${baseUrl}${route}`, { method })
  return response.json()
}

async function trayBriefing() {
  try {
    const result = await callApi('/api/briefings/generate')
    if (result.error === 'no-key') notify('Briefing', 'Add a DeepSeek key in Settings -> Connections.')
    else if (result.error) notify('Briefing failed', result.error)
    else notify('Daily briefing is ready', result.markdown.split('\n')[0].slice(0, 160))
  } catch (error) {
    notify('Briefing failed', String(error))
  }
}

async function traySync() {
  try {
    await callApi('/api/sync')
    notify('Local Dashboard', 'Sources synced.')
  } catch (error) {
    notify('Sync failed', String(error))
  }
}

function autostartEnabled() {
  return app.getLoginItemSettings().openAtLogin
}

function setAutostart(enabled) {
  app.setLoginItemSettings({ openAtLogin: enabled, args: [] })
}

function createTray() {
  const image = nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip('Local Dashboard')
  const menu = Menu.buildFromTemplate([
    { label: 'Open dashboard', click: showWindow },
    { type: 'separator' },
    { label: 'Briefing now', click: () => void trayBriefing() },
    { label: 'Sync sources', click: () => void traySync() },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: autostartEnabled(),
      click: (item) => setAutostart(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit Local Dashboard', click: quitApp },
  ])
  tray.setContextMenu(menu)
  tray.on('click', showWindow)
  watchTrayStatus()
}

function watchTrayStatus() {
  setInterval(() => {
    if (!tray || quitting || !baseUrl) return
    fetch(`${baseUrl}/api/status`)
      .then((response) => response.json())
      .then((status) => {
        const failed = status.sources?.some((source) => source.lastError)
        const state = failed ? 'sync error' : status.sync?.running ? 'syncing' : 'ready'
        tray.setToolTip(`Local Dashboard - ${state}`)
      })
      .catch(() => tray?.setToolTip('Local Dashboard - offline'))
  }, 15_000)
}

function quitApp() {
  if (quitting) return
  quitting = true
  if (!server) {
    app.exit(0)
    return
  }
  const current = server
  server = null
  const force = setTimeout(() => app.exit(0), 3000)
  current
    .close()
    .catch((error) => console.error('[desktop] close failed:', error))
    .finally(() => {
      clearTimeout(force)
      app.exit(0)
    })
}

ipcMain.on('app:quit', quitApp)
ipcMain.on('app:open-data', () => {
  void shell.openPath(dataDir)
})

async function probeDashboard(url) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return false
    const body = await response.json()
    return body?.ok === true
  } catch {
    return false
  }
}

async function boot() {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  app.on('second-instance', showWindow)

  createSplash()

  const { startServer } = require(path.join(root, 'dist', 'server', 'server.cjs'))
  const envFile = isDev ? path.join(root, '.env') : path.join(dataDir, '.env')

  try {
    server = await startServer({
      dataDir,
      webRoot: path.join(root, 'dist', 'web'),
      envFile,
      notify,
    })
  } catch (error) {
    const port = Number(process.env.PORT) || 4317
    const existing = `http://127.0.0.1:${port}`
    if (error && error.code === 'EADDRINUSE' && (await probeDashboard(existing))) {
      // A dev server or another copy already serves the dashboard: reuse it.
      console.log(`[desktop] attached to a dashboard already running on ${existing}`)
      baseUrl = existing
      createWindow()
      createTray()
      notify('Local Dashboard', `Using the dashboard already running on port ${port}.`)
      return
    }
    closeSplash()
    console.error('[desktop] server failed to start:', error)
    dialog.showErrorBox(
      'Local Dashboard could not start',
      `${error instanceof Error ? error.message : String(error)}\n\n${
        error && error.code === 'EADDRINUSE'
          ? `Port ${port} is busy with another application. Close it and try again.`
          : 'See data/server.log for details.'
      }`,
    )
    app.quit()
    return
  }

  baseUrl = `http://127.0.0.1:${server.port}`
  createWindow()
  createTray()

  // Enable autostart once for packaged installs.
  const marker = path.join(dataDir, '.autostart-initialized')
  if (!isDev && !fs.existsSync(marker)) {
    setAutostart(true)
    fs.writeFileSync(marker, new Date().toISOString())
  }
}

app.whenReady().then(() => {
  globalShortcut.register('Control+Q', quitApp)
  void boot()
})

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitApp()
})

app.on('window-all-closed', () => {
  // Keep running in the tray.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  closeSplash()
})

app.on('activate', showWindow)
