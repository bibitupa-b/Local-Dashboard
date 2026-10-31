import type { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Config } from './config.js'
import { buildAttention } from './attention.js'
import { createBriefing } from './briefing/index.js'
import type { Source } from './sources/types.js'
import { googleAuthUrl, saveGoogleCode } from './google.js'
import { todayEvents } from './sources/calendar.js'
import type { HealthMap } from './health.js'
import { getSetting, setSetting } from './db/index.js'
import {
  LIST_KEYS,
  digestWindowHours,
  getList,
  setList,
} from './settings.js'

export type RouteDeps = {
  db: DatabaseSync
  config: Config
  sources: Source[]
  generate?: typeof createBriefing
  onDriveConnected?: () => void
  isReady?: () => boolean
  health?: () => HealthMap
  syncNow?: () => Promise<void>
}

type FeedItem = {
  source: 'vault' | 'drive'
  label: string
  detail: string
  at: string
  added?: number
  removed?: number
}

function feed(db: DatabaseSync, days: number): Array<{ date: string; items: FeedItem[] }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const vault = (
    db
      .prepare(
        `SELECT path, added, removed, detected_at FROM vault_changes WHERE detected_at >= ?
         ORDER BY detected_at DESC LIMIT 300`,
      )
      .all(since) as Array<{ path: string; added: number; removed: number; detected_at: string }>
  ).map<FeedItem>((row) => ({
    source: 'vault',
    label: row.path,
    detail: `+${row.added} / -${row.removed}`,
    at: row.detected_at,
    added: row.added,
    removed: row.removed,
  }))

  const drive = (
    db
      .prepare(
        `SELECT COALESCE(f.name, c.file_id) AS name, c.kind, c.detected_at FROM drive_changes c
         LEFT JOIN drive_files f ON f.id = c.file_id WHERE c.detected_at >= ?
         ORDER BY c.detected_at DESC LIMIT 300`,
      )
      .all(since) as Array<{ name: string; kind: string; detected_at: string }>
  ).map<FeedItem>((row) => ({
    source: 'drive',
    label: row.name,
    detail: row.kind,
    at: row.detected_at,
  }))

  const groups = new Map<string, FeedItem[]>()
  for (const item of [...vault, ...drive].sort((a, b) => b.at.localeCompare(a.at))) {
    const date = item.at.slice(0, 10)
    groups.set(date, [...(groups.get(date) ?? []), item])
  }
  return [...groups].map(([date, items]) => ({ date, items }))
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, config, sources } = deps

  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/status', async () => {
    const today = new Date().toDateString()
    const briefings = db.prepare('SELECT created_at FROM briefings').all() as Array<{
      created_at: string
    }>
    return {
      sources: sources.map((source) => ({
        id: source.id,
        configured: source.configured(),
        lastSync: source.lastSync(db),
        ...(deps.health?.()[source.id] ?? { lastError: null, lastErrorAt: null, progress: null }),
      })),
      briefingToday: briefings.some((row) => new Date(row.created_at).toDateString() === today),
    }
  })

  app.post('/api/sync', async () => {
    await deps.syncNow?.()
    return { ok: true }
  })

  app.get('/api/feed', async (request) => {
    const { days } = request.query as { days?: string }
    const window = Math.min(Math.max(Number(days) || 7, 1), 3650)
    return { days: feed(db, window) }
  })

  app.get('/api/attention', async () =>
    buildAttention(db, new Date(), { staleDays: 14, inboxDays: 3 }),
  )

  app.get('/api/briefings', async (request) => {
    const { limit } = request.query as { limit?: string }
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50)
    const items = db
      .prepare('SELECT id, created_at, trigger, markdown FROM briefings ORDER BY id DESC LIMIT ?')
      .all(safeLimit)
    return { items }
  })

  let generating = false
  app.post('/api/briefings/generate', async (_request, reply) => {
    if (deps.isReady && !deps.isReady()) {
      return reply.code(503).send({ error: 'sources are still syncing, try again in a minute' })
    }
    if (generating) return reply.code(429).send({ error: 'briefing is already being generated' })
    generating = true
    try {
      const result = await (deps.generate ?? createBriefing)(db, sources, config, {
        trigger: 'manual',
      })
      if ('markdown' in result) return result
      if (result.error === 'no-key') return reply.code(400).send(result)
      return reply.code(502).send(result)
    } finally {
      generating = false
    }
  })

  app.get('/api/today', async () => ({ events: todayEvents(db, new Date()) }))

  app.get('/api/settings', async () => ({
    vaultPath: config.vaultPath,
    briefingHour: config.briefingHour,
    hasDeepSeekKey: Boolean(config.deepseekKey),
    googleConfigured: Boolean(config.googleClientId && config.googleClientSecret),
    driveConnected: Boolean(getSetting(db, 'drive_cursor')),
    mailConfigured: Boolean(config.gmailUser && config.gmailPassword),
    mailConnected: Boolean(getSetting(db, 'last_sync_mail')),
    calendarConnected: Boolean(getSetting(db, 'last_sync_calendar')),
    excludedSenders: getList(db, LIST_KEYS.mailSenders),
    excludedMailFolders: getList(db, LIST_KEYS.mailFolders),
    excludedVaultPrefixes: getList(db, LIST_KEYS.vaultPrefixes),
    digestWindowHours: digestWindowHours(db),
    enabledSources: getList(db, 'enabled_sources'),
  }))

  app.put('/api/settings', async (request) => {
    const body = (request.body ?? {}) as {
      vaultPath?: string
      briefingHour?: number
      excludedSenders?: string[]
      excludedMailFolders?: string[]
      excludedVaultPrefixes?: string[]
      digestWindowHours?: number
      enabledSources?: string[]
    }
    if (typeof body.vaultPath === 'string' && body.vaultPath.trim()) {
      const next = body.vaultPath.trim()
      if (next !== config.vaultPath) {
        // Re-index the new vault from scratch; keeping the old rows would fake mass deletions.
        db.exec('DELETE FROM vault_files; DELETE FROM vault_changes; DELETE FROM tasks')
      }
      config.vaultPath = next
      setSetting(db, 'vault_path', next)
    }
    if (typeof body.briefingHour === 'number' && body.briefingHour >= 0 && body.briefingHour <= 23) {
      config.briefingHour = body.briefingHour
      setSetting(db, 'briefing_hour', String(body.briefingHour))
    }
    if (Array.isArray(body.excludedSenders)) setList(db, LIST_KEYS.mailSenders, body.excludedSenders)
    if (Array.isArray(body.excludedMailFolders))
      setList(db, LIST_KEYS.mailFolders, body.excludedMailFolders)
    if (Array.isArray(body.excludedVaultPrefixes))
      setList(db, LIST_KEYS.vaultPrefixes, body.excludedVaultPrefixes)
    if (Array.isArray(body.enabledSources)) setList(db, 'enabled_sources', body.enabledSources)
    if (typeof body.digestWindowHours === 'number' && body.digestWindowHours >= 1) {
      setSetting(db, 'digest_window_hours', String(body.digestWindowHours))
    }
    return { ok: true }
  })

  app.get('/api/oauth/google/start', async (_request, reply) => {
    const state = randomBytes(16).toString('hex')
    setSetting(db, 'google_oauth_state', state)
    const url = googleAuthUrl(config, state)
    if (!url) return reply.code(400).send({ error: 'Google credentials are not configured' })
    return reply.redirect(url)
  })

  app.get('/api/oauth/google/callback', async (request, reply) => {
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string }
    const expected = getSetting(db, 'google_oauth_state')
    if (error || !code || !state || !expected || state !== expected) {
      return reply.redirect('/?drive=error')
    }
    setSetting(db, 'google_oauth_state', '')
    try {
      await saveGoogleCode(config, code)
    } catch (failure) {
      console.error('[drive] OAuth exchange failed:', failure)
      return reply.redirect('/?drive=error')
    }
    deps.onDriveConnected?.()
    return reply.redirect('/?drive=connected')
  })
}
