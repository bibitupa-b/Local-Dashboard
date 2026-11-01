import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { schedule, type ScheduledTask } from 'node-cron'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { getSetting, openDb, setSetting } from './db/index.js'
import { createBriefing } from './briefing/index.js'
import { shouldCatchUp } from './briefing/schedule.js'
import { initLogging } from './log.js'
import { createDriveSource, createGoogleDriveApi } from './sources/drive.js'
import { createCalendarSource, createGoogleCalendarApi } from './sources/calendar.js'
import { createMailSource } from './sources/mail.js'
import { createImapMailApi } from './sources/mail-imap.js'
import { createBrowserSource } from './sources/browser.js'
import { createChromiumBrowserReader } from './sources/browser-chromium.js'
import { createGithubApi, createGithubSource } from './sources/github.js'
import type { Source } from './sources/types.js'
import { createVaultSource, startVaultWatcher } from './sources/vault/index.js'
import {
  createHealth,
  createSyncState,
  finishSync,
  markFailure,
  markProgress,
  markSuccess,
  startSync,
  updateSyncProgress,
} from './health.js'
import { dueEventNotification, notify } from './notify.js'
import { todayEvents } from './sources/calendar.js'
import { backupDb } from './backup.js'

export type ServerOptions = {
  dataDir?: string
  port?: number
  webRoot?: string
  envFile?: string | null
  notify?: (title: string, message: string) => void
}

export type RunningServer = {
  app: FastifyInstance
  port: number
  close: () => Promise<void>
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const envFile = options.envFile === undefined ? join(process.cwd(), '.env') : options.envFile
  if (envFile) {
    try {
      process.loadEnvFile(envFile)
    } catch {
      // no .env yet — the dashboard still works, minus keys
    }
  }

  const config = loadConfig()
  if (options.dataDir) {
    config.dataDir = resolve(options.dataDir)
    config.dbPath = join(config.dataDir, 'dashboard.db')
  }
  if (options.port !== undefined) config.port = options.port
  initLogging(config.dataDir)
  const db = openDb(config.dbPath)

  config.vaultPath = getSetting(db, 'vault_path') ?? config.vaultPath
  config.briefingHour = Number(getSetting(db, 'briefing_hour')) || config.briefingHour

  const sources: Source[] = [
    createVaultSource(config.vaultPath),
    createDriveSource(await createGoogleDriveApi(config)),
    createMailSource(createImapMailApi(config)),
    createCalendarSource(await createGoogleCalendarApi(config)),
    createBrowserSource(createChromiumBrowserReader(config.dataDir, config.browserHistoryPath)),
    createGithubSource(createGithubApi(config)),
  ]

  const webRoot = options.webRoot ?? join(process.cwd(), 'dist', 'web')
  const send = options.notify ?? notify
  let ready = false
  let syncing: Promise<void> | null = null
  const health = createHealth(sources.map((source) => source.id))
  const syncState = createSyncState()

  async function syncAll(): Promise<void> {
    if (syncing) return syncing
    syncing = (async () => {
      for (const [index, source] of sources.entries()) {
        startSync(syncState, source.id, index, sources.length)
        try {
          await source.sync(db, new Date(), (done, total) => {
            updateSyncProgress(syncState, done, total)
            markProgress(health, source.id, done, total)
          })
          markSuccess(health, source.id)
        } catch (error) {
          markFailure(health, source.id, error)
          console.error(`[${source.id}] sync failed:`, error)
        }
      }
    })()
    try {
      await syncing
    } finally {
      finishSync(syncState)
      syncing = null
    }
  }

  const app = buildApp({
    db,
    config,
    sources,
    webRoot,
    isReady: () => ready,
    health: () => health,
    syncState: () => syncState,
    syncNow: syncAll,
    onDriveConnected: () => {
      void (async () => {
        const drive = await createGoogleDriveApi(config)
        const calendar = await createGoogleCalendarApi(config)
        const driveIndex = sources.findIndex((source) => source.id === 'drive')
        const calendarIndex = sources.findIndex((source) => source.id === 'calendar')
        if (drive && driveIndex >= 0) sources[driveIndex] = createDriveSource(drive)
        if (calendar && calendarIndex >= 0) sources[calendarIndex] = createCalendarSource(calendar)
        await syncAll()
      })().catch((error) => console.error('[google] reconnect failed:', error))
    },
  })

  const stopWatcher = startVaultWatcher(config.vaultPath, db)

  async function brief(trigger: 'auto' | 'manual'): Promise<void> {
    const result = await createBriefing(db, sources, config, { trigger })
    if ('error' in result) {
      console.error('[briefing]', result.error)
      return
    }
    console.log('[briefing] generated')
    if (trigger === 'auto') {
      send('Daily briefing is ready', result.markdown.split('\n')[0]!.slice(0, 160))
    }
  }

  function checkEventNotifications(): void {
    if (!ready) return
    const due = dueEventNotification(
      todayEvents(db, new Date()),
      new Date(),
      getSetting(db, 'last_notified_event'),
    )
    if (!due) return
    send(due.title, due.message)
    setSetting(db, 'last_notified_event', due.eventId)
  }

  function maybeBrief(): void {
    if (!ready) return
    const last = db.prepare('SELECT created_at FROM briefings ORDER BY id DESC LIMIT 1').get() as
      | { created_at: string }
      | undefined
    if (shouldCatchUp(last ? new Date(last.created_at) : null, new Date(), config.briefingHour)) {
      void brief('auto')
    }
  }

  const tasks: ScheduledTask[] = [
    schedule(`0 ${config.briefingHour} * * *`, maybeBrief),
    schedule('*/5 * * * *', checkEventNotifications),
    schedule('0 3 * * *', () => {
      try {
        const path = backupDb(db, config.dataDir)
        if (path) console.log(`[backup] ${path}`)
      } catch (error) {
        console.error('[backup] failed:', error)
      }
    }),
    schedule('*/15 * * * *', () => {
      void syncAll().then(maybeBrief)
    }),
  ]

  await app.listen({ host: '127.0.0.1', port: config.port })
  const address = app.server.address()
  const port = typeof address === 'object' && address ? address.port : config.port
  console.log(`Local Dashboard on http://localhost:${port}`)

  // The UI is served immediately; a slow mailbox must not block startup.
  const startup = (async () => {
    await syncAll()
    ready = true
    maybeBrief()
    try {
      backupDb(db, config.dataDir)
    } catch (error) {
      console.error('[backup] failed:', error)
    }
  })().catch((error) => console.error('[startup] sync failed:', error))

  return {
    app,
    port,
    close: async () => {
      for (const task of tasks) task.stop()
      await stopWatcher()
      await startup
      await app.close()
      db.close()
    },
  }
}
