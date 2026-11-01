import { join, resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { schedule, type ScheduledTask } from 'node-cron'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { getSetting, openDb, setSetting } from './db/index.js'
import { createBriefing } from './briefing/index.js'
import { shouldCatchUp } from './briefing/schedule.js'
import { initLogging } from './log.js'
import type { Source } from './sources/types.js'
import { startVaultWatcher } from './sources/vault/index.js'
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
import { createSecretBox } from './secrets.js'
import {
  assignLegacyConnections,
  deleteConnection,
  getConnection,
  importConnectionsFromEnv,
  listConnections,
  purgeConnectionData,
  saveConnection,
  type ConnectionInput,
} from './connections.js'
import { buildSources, googleCreds, publicConnections, toPublicConnection } from './registry.js'
import { testConnection } from './connection-test.js'
import { exchangeGoogleCode, googleAuthUrl } from './google.js'

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
  const box = createSecretBox(config.dataDir)
  importConnectionsFromEnv(db, box, config, config.dataDir)
  assignLegacyConnections(db)

  config.vaultPath = getSetting(db, 'vault_path') ?? config.vaultPath
  config.briefingHour = Number(getSetting(db, 'briefing_hour')) || config.briefingHour

  let sources: Source[] = buildSources({ db, box, config, dataDir: config.dataDir })
  let stopWatchers: Array<() => Promise<void>> = []

  const webRoot = options.webRoot ?? join(process.cwd(), 'dist', 'web')
  const send = options.notify ?? notify
  let ready = false
  let syncing: Promise<void> | null = null
  let health = createHealth(sources.map((source) => source.id))
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

  function watchVaults(): void {
    for (const connection of listConnections(db, box)) {
      if (connection.service !== 'vault' || !connection.enabled) continue
      stopWatchers.push(
        startVaultWatcher(connection.config.path || config.vaultPath, db, connection.id),
      )
    }
  }

  async function reloadSources(): Promise<void> {
    if (syncing) await syncing.catch(() => {})
    await Promise.all(stopWatchers.map((stop) => stop()))
    stopWatchers = []
    sources = buildSources({ db, box, config, dataDir: config.dataDir })
    health = createHealth(sources.map((source) => source.id))
    watchVaults()
    void syncAll()
  }

  watchVaults()

  const app = buildApp({
    db,
    config,
    sources,
    getSources: () => sources,
    webRoot,
    isReady: () => ready,
    health: () => health,
    syncState: () => syncState,
    syncNow: syncAll,
    reload: reloadSources,
    connections: {
      list: () => publicConnections(db, box),
      save: (input: ConnectionInput) => toPublicConnection(saveConnection(db, box, input)),
      remove: (id: string) => {
        purgeConnectionData(db, id)
        deleteConnection(db, id)
      },
      test: async (id: string) => {
        const connection = getConnection(db, box, id)
        return connection ? testConnection(connection) : { ok: false, error: 'Unknown connection' }
      },
    },
    googleStart: (connectionId, state) => {
      const connection = getConnection(db, box, connectionId)
      if (!connection || connection.service !== 'google') return null
      if (!connection.config.clientId || !connection.secret?.clientSecret) return null
      return googleAuthUrl(
        googleCreds(connection, { db, box, config, dataDir: config.dataDir }),
        state,
      )
    },
    googleComplete: async (connectionId, code) => {
      const connection = getConnection(db, box, connectionId)
      if (!connection || connection.service !== 'google') {
        throw new Error('Unknown Google connection')
      }
      const tokens = await exchangeGoogleCode(
        googleCreds(connection, { db, box, config, dataDir: config.dataDir }),
        code,
      )
      saveConnection(db, box, {
        id: connection.id,
        service: 'google',
        label: connection.label,
        config: connection.config,
        secret: { ...connection.secret, tokens },
      })
      await reloadSources()
    },
  })

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
      await Promise.all(stopWatchers.map((stop) => stop()))
      await startup
      await app.close()
      db.close()
    },
  }
}
