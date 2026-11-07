import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { schedule, type ScheduledTask } from 'node-cron'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { getSetting, openDb, setSetting } from './db/index.js'
import { createBriefing, type BriefingKind } from './briefing/index.js'
import { claimBriefing, releaseBriefing } from './briefing/lock.js'
import { isEveningDue, isWeeklyDue, shouldCatchUp } from './briefing/schedule.js'
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
import { dueEventNotification, dueMeetingPrep, notify } from './notify.js'
import { todayEvents } from './sources/calendar.js'
import { visibleAttention } from './attention.js'
import { createSerialRunner, newMailNotifications } from './idle.js'
import { backupDb } from './backup.js'
import { rebuildSearchIndex } from './search-index.js'
import { applyRetention } from './retention.js'
import { createSecretBox } from './secrets.js'
import {
  assignLegacyConnections,
  deleteConnection,
  getConnection,
  importConnectionsFromEnv,
  listConnections,
  normalizeMailFolders,
  purgeConnectionData,
  resolveDeepseekKey,
  saveConnection,
  type ConnectionInput,
} from './connections.js'
import { buildSources, googleCreds, microsoftCreds, publicConnections, toPublicConnection } from './registry.js'
import { testConnection } from './connection-test.js'
import { deliverBriefing } from './delivery.js'
import { exchangeGoogleCode, googleAuthUrl } from './google.js'
import { exchangeMicrosoftCode, microsoftAuthUrl } from './microsoft.js'

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

type MicrosoftOAuthState = { connectionId: string; verifier: string; expiresAt: number }
const MICROSOFT_STATE_TTL_MS = 10 * 60_000
const microsoftStates = new Map<string, MicrosoftOAuthState>()

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
  normalizeMailFolders(db)

  const envDeepseekKey = config.deepseekKey
  if (envDeepseekKey && !listConnections(db, box).some((row) => row.service === 'deepseek')) {
    saveConnection(db, box, {
      service: 'deepseek',
      label: 'DeepSeek',
      config: {},
      secret: { key: envDeepseekKey },
    })
  }
  function applyDeepseekKey(): void {
    config.deepseekKey = resolveDeepseekKey(db, box, envDeepseekKey)
  }
  applyDeepseekKey()

  config.vaultPath = getSetting(db, 'vault_path') ?? config.vaultPath
  const storedBriefingHour = getSetting(db, 'briefing_hour')
  if (storedBriefingHour !== null && storedBriefingHour.trim() !== '') {
    const hour = Number(storedBriefingHour)
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) config.briefingHour = hour
  }

  let sources: Source[] = buildSources({ db, box, config, dataDir: config.dataDir })
  let stopWatchers: Array<() => Promise<void>> = []

  const webRoot = options.webRoot ?? join(process.cwd(), 'dist', 'web')
  const send = options.notify ?? notify
  let ready = false
  let closed = false
  let syncing: Promise<void> | null = null
  let health = createHealth(sources.map((source) => source.id))
  const syncState = createSyncState()

  /** A source that never answers must not hold the whole dashboard hostage. */
  function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
      work.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  }

  async function syncAll(): Promise<void> {
    if (syncing) return syncing
    syncing = (async () => {
      for (const [index, source] of sources.entries()) {
        startSync(syncState, source.id, index, sources.length)
        try {
          await withTimeout(
            source.sync(db, new Date(), (done, total) => {
              updateSyncProgress(syncState, done, total)
              markProgress(health, source.id, done, total)
            }),
            120_000,
            `sync ${source.id}`,
          )
          markSuccess(health, source.id)
        } catch (error) {
          markFailure(health, source.id, error)
          console.error(`[${source.id}] sync failed:`, error)
        }
      }
      try {
        applyRetention(db)
        rebuildSearchIndex(db)
      } catch (error) {
        // Search falls back to LIKE until the next successful rebuild.
        console.error('[search] index rebuild failed:', error)
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

  const SEEN_KEY = 'idle_seen_messages'
  const SEEN_MAX = 200

  function loadSeenMessages(): Set<string> {
    const raw = getSetting(db, SEEN_KEY)
    if (!raw) return new Set()
    try {
      const parsed = JSON.parse(raw)
      return new Set(
        Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [],
      )
    } catch {
      return new Set()
    }
  }

  let seenMessages = loadSeenMessages()
  const sourceRunners = new Map<string, () => void>()

  function persistSeenMessages(): void {
    const bounded =
      seenMessages.size > SEEN_MAX ? new Set([...seenMessages].slice(-SEEN_MAX)) : seenMessages
    seenMessages = bounded
    setSetting(db, SEEN_KEY, JSON.stringify([...bounded]))
  }

  async function syncSource(source: Source): Promise<void> {
    try {
      const before = visibleAttention(db, new Date(), { staleDays: 14, inboxDays: 3 })
      await withTimeout(source.sync(db, new Date()), 120_000, `sync ${source.id}`)
      const after = visibleAttention(db, new Date(), { staleDays: 14, inboxDays: 3 })
      const fresh = newMailNotifications(before, after, seenMessages)
      if (fresh.length === 0) return
      for (const item of fresh) {
        send('New mail', item.label)
        if (item.messageId) seenMessages.add(item.messageId)
      }
      persistSeenMessages()
    } catch (error) {
      // The watcher callback is fire-and-forget; log here so nothing escapes as unhandled.
      console.error(`[${source.id}] IDLE sync failed:`, error)
    }
  }

  function onSourceChange(source: Source): void {
    let runner = sourceRunners.get(source.id)
    if (!runner) {
      runner = createSerialRunner(() => syncSource(source))
      sourceRunners.set(source.id, runner)
    }
    runner()
  }

  async function startSourceWatchers(): Promise<void> {
    for (const source of sources) {
      if (!source.watch) continue
      try {
        stopWatchers.push(await source.watch(() => onSourceChange(source)))
      } catch (error) {
        console.error(`[${source.id}] watch failed:`, error)
      }
    }
  }

  async function reloadSources(): Promise<void> {
    if (syncing) await syncing.catch(() => {})
    await Promise.all(stopWatchers.map((stop) => stop().catch(() => {})))
    stopWatchers = []
    sourceRunners.clear()
    applyDeepseekKey()
    sources = buildSources({ db, box, config, dataDir: config.dataDir })
    health = createHealth(sources.map((source) => source.id))
    watchVaults()
    await startSourceWatchers()
    void syncAll()
  }

  watchVaults()
  void startSourceWatchers()

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
    microsoftStart: (connectionId, state) => {
      const connection = getConnection(db, box, connectionId)
      if (!connection || connection.service !== 'microsoft') return null
      if (!connection.config.clientId) return null
      const verifier = randomBytes(32).toString('base64url')
      const now = Date.now()
      for (const [key, entry] of microsoftStates) {
        if (entry.expiresAt <= now) microsoftStates.delete(key)
      }
      microsoftStates.set(state, {
        connectionId,
        verifier,
        expiresAt: now + MICROSOFT_STATE_TTL_MS,
      })
      return microsoftAuthUrl(
        microsoftCreds(connection, { db, box, config, dataDir: config.dataDir }),
        state,
        verifier,
      )
    },
    microsoftComplete: async (code, state) => {
      const entry = microsoftStates.get(state)
      if (!entry || entry.expiresAt <= Date.now()) {
        microsoftStates.delete(state)
        throw new Error('Microsoft OAuth state is unknown or expired')
      }
      microsoftStates.delete(state)
      const connection = getConnection(db, box, entry.connectionId)
      if (!connection || connection.service !== 'microsoft') {
        throw new Error('Unknown Microsoft connection')
      }
      const tokens = await exchangeMicrosoftCode(
        microsoftCreds(connection, { db, box, config, dataDir: config.dataDir }),
        code,
        entry.verifier,
      )
      saveConnection(db, box, {
        id: connection.id,
        service: 'microsoft',
        label: connection.label,
        config: connection.config,
        secret: { ...connection.secret, tokens: JSON.stringify(tokens) },
      })
      await reloadSources()
    },
  })

  async function brief(trigger: 'auto' | 'manual', kind: BriefingKind = 'daily'): Promise<void> {
    if (!claimBriefing()) return
    try {
      await runBrief(trigger, kind)
    } finally {
      releaseBriefing()
    }
  }

  async function runBrief(trigger: 'auto' | 'manual', kind: BriefingKind = 'daily'): Promise<void> {
    const result = await createBriefing(db, sources, config, { trigger, kind })
    if ('error' in result) {
      console.error('[briefing]', result.error)
      const previous = getSetting(db, 'briefing_last_error')
      setSetting(
        db,
        'briefing_last_error',
        JSON.stringify({ at: new Date().toISOString(), message: result.error }),
      )
      // The 15-minute retry must not repeat the same alert on every attempt.
      let previousMessage: string | null = null
      try {
        previousMessage = (JSON.parse(previous ?? '') as { message?: string }).message ?? null
      } catch {
        previousMessage = null
      }
      if (previousMessage !== result.error) {
        send(
          kind === 'weekly'
            ? 'Weekly review failed'
            : kind === 'evening'
              ? 'Evening pass failed'
              : 'Daily briefing failed',
          result.error.slice(0, 160),
        )
      }
      return
    }
    setSetting(db, 'briefing_last_error', '')
    console.log('[briefing] generated')
    // Delivery is fire-and-forget: it must never block or break the briefing that was just saved.
    void deliverBriefing(db, box, result, kind)
    if (trigger === 'auto') {
      send(
        kind === 'weekly'
          ? 'Weekly review is ready'
          : kind === 'evening'
            ? 'Evening pass is ready'
            : 'Daily briefing is ready',
        result.markdown.split('\n')[0]!.slice(0, 160),
      )
    }
  }

  function checkEventNotifications(): void {
    if (!ready) return
    const now = new Date()
    const events = todayEvents(db, now)
    const due = dueEventNotification(events, now, getSetting(db, 'last_notified_event'))
    if (due) {
      send(due.title, due.message)
      setSetting(db, 'last_notified_event', due.eventId)
    }
    if (getSetting(db, 'meeting_prep') === '0') return
    const prep = dueMeetingPrep(events, now, getSetting(db, 'last_notified_meeting'))
    if (!prep) return
    send(prep.title, prep.message)
    setSetting(db, 'last_notified_meeting', prep.eventId)
  }

  function maybeBrief(): void {
    if (!ready || closed) return
    const last = db
      .prepare("SELECT created_at FROM briefings WHERE kind = 'daily' ORDER BY id DESC LIMIT 1")
      .get() as { created_at: string } | undefined
    if (shouldCatchUp(last ? new Date(last.created_at) : null, new Date(), config.briefingHour)) {
      void brief('auto')
    }
  }

  function maybeWeekly(): void {
    if (!ready || closed) return
    // A fresh install should not open with a weekly review before its first daily.
    const history = db
      .prepare("SELECT COUNT(*) AS n FROM briefings WHERE kind = 'daily'")
      .get() as { n: number }
    if (history.n === 0) return
    const last = db
      .prepare("SELECT created_at FROM briefings WHERE kind = 'weekly' ORDER BY id DESC LIMIT 1")
      .get() as { created_at: string } | undefined
    if (isWeeklyDue(last ? new Date(last.created_at) : null, new Date())) {
      void brief('auto', 'weekly')
    }
  }

  function maybeEvening(): void {
    if (!ready || closed) return
    // Sunday 18:00 already carries the weekly review; two briefings at once is noise.
    if (new Date().getDay() === 0) return
    if (getSetting(db, 'evening_pass') !== '1') return
    const last = (kind: string): Date | null => {
      const row = db
        .prepare('SELECT created_at FROM briefings WHERE kind = ? ORDER BY id DESC LIMIT 1')
        .get(kind) as { created_at: string } | undefined
      return row ? new Date(row.created_at) : null
    }
    if (isEveningDue(last('daily'), last('evening'), new Date(), 18)) {
      void brief('auto', 'evening')
    }
  }

  const tasks: ScheduledTask[] = [
    // The 15-minute sync calls maybeBrief; this hourly nudge also covers a paused sync loop.
    // `maybeBrief` itself checks the configured briefing hour, so changing it needs no restart.
    schedule('0 * * * *', maybeBrief),
    schedule('0 18 * * *', maybeEvening),
    schedule('0 18 * * 0', maybeWeekly),
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
    if (closed) return
    ready = true
    maybeBrief()
    maybeEvening()
    maybeWeekly()
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
      if (closed) return
      closed = true
      for (const task of tasks) task.stop()
      await Promise.all(stopWatchers.map((stop) => stop().catch(() => {})))
      // Let an in-flight sync finish its last write before the handle closes.
      if (syncing) {
        await Promise.race([
          syncing.catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ])
      }
      await app.close().catch(() => {})
      try {
        db.close()
      } catch {
        // already closed by an in-flight shutdown
      }
    },
  }
}
