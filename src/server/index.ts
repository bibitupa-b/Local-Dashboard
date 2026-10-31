import { join } from 'node:path'
import { schedule } from 'node-cron'
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
import type { Source } from './sources/types.js'
import { createVaultSource, startVaultWatcher } from './sources/vault/index.js'
import { createHealth, markFailure, markProgress, markSuccess } from './health.js'
import { dueEventNotification, notify } from './notify.js'
import { todayEvents } from './sources/calendar.js'

try {
  process.loadEnvFile(join(process.cwd(), '.env'))
} catch {
  // no .env yet — the dashboard still works, minus keys
}

const config = loadConfig()
initLogging(config.dataDir)
const db = openDb(config.dbPath)

config.vaultPath = getSetting(db, 'vault_path') ?? config.vaultPath
config.briefingHour = Number(getSetting(db, 'briefing_hour')) || config.briefingHour

const sources: Source[] = [
  createVaultSource(config.vaultPath),
  createDriveSource(await createGoogleDriveApi(config)),
  createMailSource(createImapMailApi(config)),
  createCalendarSource(await createGoogleCalendarApi(config)),
]

const webRoot = join(process.cwd(), 'dist', 'web')
let ready = false
let syncing: Promise<void> | null = null
const health = createHealth(sources.map((source) => source.id))

async function syncAll(): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    for (const source of sources) {
      try {
        await source.sync(db, new Date(), (done, total) =>
          markProgress(health, source.id, done, total),
        )
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
    notify('Daily briefing is ready', result.markdown.split('\n')[0]!.slice(0, 160))
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
  notify(due.title, due.message)
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

schedule(`0 ${config.briefingHour} * * *`, maybeBrief)
schedule('*/5 * * * *', checkEventNotifications)
schedule('*/15 * * * *', () => {
  void syncAll().then(maybeBrief)
})

try {
  await app.listen({ host: '127.0.0.1', port: config.port })
  console.log(`Local Dashboard on http://localhost:${config.port}`)
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use — another Local Dashboard is probably running.`)
    process.exit(0)
  }
  throw error
}

// The UI is served immediately; a slow mailbox must not block startup.
void (async () => {
  await syncAll()
  ready = true
  maybeBrief()
})().catch((error) => console.error('[startup] sync failed:', error))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await stopWatcher()
    await app.close()
    process.exit(0)
  })
}
