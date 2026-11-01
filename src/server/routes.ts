import type { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Config } from './config.js'
import { buildAttention } from './attention.js'
import { createBriefing } from './briefing/index.js'
import type { Source } from './sources/types.js'
import { todayEvents, dayPlan } from './sources/calendar.js'
import type { HealthMap, SyncState } from './health.js'
import { getSetting, setSetting } from './db/index.js'
import {
  LIST_KEYS,
  digestWindowHours,
  getList,
  normalizeVaultPrefixes,
  setList,
} from './settings.js'
import type { ConnectionInput } from './connections.js'

export type PublicConnection = {
  id: string
  service: string
  label: string
  config: Record<string, string>
  enabled: boolean
  lastError: string | null
  createdAt: string
  secretsSet: string[]
}

export type ConnectionsApi = {
  list: () => PublicConnection[]
  save: (input: ConnectionInput) => PublicConnection
  remove: (id: string) => void
  test: (id: string) => Promise<{ ok: boolean; error?: string }>
}

export type RouteDeps = {
  db: DatabaseSync
  config: Config
  sources: Source[] | (() => Source[])
  getSources?: () => Source[]
  generate?: typeof createBriefing
  isReady?: () => boolean
  health?: () => HealthMap
  syncState?: () => SyncState
  syncNow?: () => Promise<void>
  reload?: () => Promise<void>
  connections?: ConnectionsApi
  googleStart?: (connectionId: string, state: string) => string | null
  googleComplete?: (connectionId: string, code: string) => Promise<void>
}

type FeedItem = {
  source: 'vault' | 'drive'
  id?: number
  label: string
  detail: string
  at: string
  added?: number
  removed?: number
}

function snippet(text: string, term: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = flat.toLowerCase().indexOf(term.toLowerCase())
  if (at < 0) return flat.slice(0, 160)
  const start = Math.max(0, at - 60)
  const end = Math.min(flat.length, at + term.length + 100)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

function feed(db: DatabaseSync, days: number): Array<{ date: string; items: FeedItem[] }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const vault = (
    db
      .prepare(
        `SELECT id, path, added, removed, detected_at FROM vault_changes WHERE detected_at >= ?
         ORDER BY detected_at DESC LIMIT 300`,
      )
      .all(since) as Array<{
      id: number
      path: string
      added: number
      removed: number
      detected_at: string
    }>
  ).map<FeedItem>((row) => ({
    source: 'vault',
    id: row.id,
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
         LEFT JOIN drive_files f ON f.connection_id = c.connection_id AND f.id = c.file_id WHERE c.detected_at >= ?
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
  const { db, config } = deps
  const sourceList = (): Source[] =>
    typeof deps.sources === 'function' ? deps.sources() : deps.sources

  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/status', async () => {
    const today = new Date().toDateString()
    const briefings = db.prepare('SELECT created_at FROM briefings').all() as Array<{
      created_at: string
    }>
    return {
      sources: sourceList().map((source) => ({
        id: source.id,
        kind: source.kind,
        service: source.service,
        connectionId: source.connectionId,
        label: source.label,
        configured: source.configured(),
        lastSync: source.lastSync(db),
        ...(deps.health?.()[source.id] ?? { lastError: null, lastErrorAt: null, progress: null }),
      })),
      briefingToday: briefings.some((row) => new Date(row.created_at).toDateString() === today),
      sync:
        deps.syncState?.() ?? {
          running: false,
          source: null,
          sourceIndex: 0,
          sourceTotal: 0,
          done: 0,
          total: 0,
        },
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
      const result = await (deps.generate ?? createBriefing)(db, sourceList(), config, {
        trigger: 'manual',
      })
      if ('markdown' in result) return result
      if (result.error === 'no-key') return reply.code(400).send(result)
      return reply.code(502).send(result)
    } finally {
      generating = false
    }
  })

  app.get('/api/today', async () => {
    const now = new Date()
    const events = todayEvents(db, now)
    return { events, ...dayPlan(events, now) }
  })

  app.get('/api/search', async (request) => {
    const { q } = request.query as { q?: string }
    const term = (q ?? '').trim()
    if (term.length < 2) return { notes: [], mail: [], drive: [] }
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`

    const notes = (
      db
        .prepare(
          `SELECT path, previous_text AS text FROM vault_files
           WHERE path LIKE ? ESCAPE '\\' OR previous_text LIKE ? ESCAPE '\\'
           ORDER BY mtime DESC LIMIT 10`,
        )
        .all(like, like) as Array<{ path: string; text: string }>
    ).map((row) => ({ path: row.path, snippet: snippet(row.text, term) }))

    const mail = db
      .prepare(
        `SELECT sender, subject, date, message_id AS messageId FROM mail_messages
         WHERE subject LIKE ? ESCAPE '\\' OR sender LIKE ? ESCAPE '\\' OR snippet LIKE ? ESCAPE '\\'
         GROUP BY COALESCE(message_id, folder || ':' || uid)
         ORDER BY MAX(date) DESC LIMIT 10`,
      )
      .all(like, like, like)

    const drive = db
      .prepare(
        `SELECT f.id, f.name, f.modified_time AS modifiedTime,
                (SELECT substr(d.text, 1, 160) FROM drive_doc_text d WHERE d.file_id = f.id) AS snippet
         FROM drive_files f
         WHERE f.name LIKE ? ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM drive_doc_text d WHERE d.file_id = f.id AND d.text LIKE ? ESCAPE '\\')
         ORDER BY f.modified_time DESC LIMIT 10`,
      )
      .all(like, like)

    return { notes, mail, drive }
  })

  app.get('/api/vault/changes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = db.prepare('SELECT path, diff, detected_at FROM vault_changes WHERE id = ?').get(Number(id)) as
      | { path: string; diff: string; detected_at: string }
      | undefined
    if (!row) return reply.code(404).send({ error: 'not found' })
    return row
  })

  app.get('/api/settings', async () => {
    const connections = deps.connections?.list() ?? []
    const has = (service: string) => connections.some((row) => row.service === service)
    return {
      vaultPath:
        deps.connections?.list().find((row) => row.service === 'vault')?.config.path ??
        config.vaultPath,
      briefingHour: config.briefingHour,
      hasDeepSeekKey: Boolean(config.deepseekKey),
      driveConnected: connections.some(
        (row) => row.service === 'google' && row.secretsSet.includes('tokens'),
      ),
      mailConfigured: has('imap'),
      mailConnected: sourceList().some((source) => source.kind === 'mail' && source.lastSync(db)),
      calendarConnected: sourceList().some(
        (source) => source.kind === 'calendar' && source.lastSync(db),
      ),
      excludedSenders: getList(db, LIST_KEYS.mailSenders),
      excludedMailFolders: getList(db, LIST_KEYS.mailFolders),
      excludedVaultPrefixes: getList(db, LIST_KEYS.vaultPrefixes),
      excludedBrowserDomains: getList(db, LIST_KEYS.browserDomains),
      browserConfigured: has('browser'),
      githubConfigured: has('github'),
      githubConnected: sourceList().some(
        (source) => source.kind === 'github' && source.lastSync(db),
      ),
      digestWindowHours: digestWindowHours(db),
      enabledSources: getList(db, 'enabled_sources'),
    }
  })

  app.get('/api/connections', async () => ({ items: deps.connections?.list() ?? [] }))

  app.post('/api/connections', async (request, reply) => {
    if (!deps.connections) return reply.code(503).send({ error: 'connections are not available' })
    const body = (request.body ?? {}) as ConnectionInput
    if (!body.service || !body.label) {
      return reply.code(400).send({ error: 'service and label are required' })
    }
    const saved = deps.connections.save({ ...body, id: undefined })
    await deps.reload?.()
    return saved
  })

  app.put('/api/connections/:id', async (request, reply) => {
    if (!deps.connections) return reply.code(503).send({ error: 'connections are not available' })
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as Omit<ConnectionInput, 'id'>
    try {
      const saved = deps.connections.save({ ...body, id })
      await deps.reload?.()
      return saved
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  app.delete('/api/connections/:id', async (request) => {
    const { id } = request.params as { id: string }
    deps.connections?.remove(id)
    await deps.reload?.()
    return { ok: true }
  })

  app.post('/api/connections/:id/test', async (request, reply) => {
    if (!deps.connections) return reply.code(503).send({ error: 'connections are not available' })
    const { id } = request.params as { id: string }
    return deps.connections.test(id)
  })

  app.put('/api/settings', async (request) => {
    const body = (request.body ?? {}) as {
      briefingHour?: number
      excludedSenders?: string[]
      excludedMailFolders?: string[]
      excludedVaultPrefixes?: string[]
      excludedBrowserDomains?: string[]
      digestWindowHours?: number
      enabledSources?: string[]
    }
    if (typeof body.briefingHour === 'number' && body.briefingHour >= 0 && body.briefingHour <= 23) {
      config.briefingHour = body.briefingHour
      setSetting(db, 'briefing_hour', String(body.briefingHour))
    }
    if (Array.isArray(body.excludedSenders)) setList(db, LIST_KEYS.mailSenders, body.excludedSenders)
    if (Array.isArray(body.excludedMailFolders))
      setList(db, LIST_KEYS.mailFolders, body.excludedMailFolders)
    if (Array.isArray(body.excludedVaultPrefixes))
      setList(
        db,
        LIST_KEYS.vaultPrefixes,
        normalizeVaultPrefixes(body.excludedVaultPrefixes, config.vaultPath),
      )
    if (Array.isArray(body.excludedBrowserDomains))
      setList(db, LIST_KEYS.browserDomains, body.excludedBrowserDomains)
    if (Array.isArray(body.enabledSources)) setList(db, 'enabled_sources', body.enabledSources)
    if (typeof body.digestWindowHours === 'number' && body.digestWindowHours >= 1) {
      setSetting(db, 'digest_window_hours', String(body.digestWindowHours))
    }
    return { ok: true }
  })

  app.get('/api/oauth/google/start', async (request, reply) => {
    const { connection } = request.query as { connection?: string }
    const target =
      connection ?? deps.connections?.list().find((row) => row.service === 'google')?.id
    if (!target) return reply.code(400).send({ error: 'No Google connection configured' })
    const state = randomBytes(16).toString('hex')
    setSetting(db, 'google_oauth_state', `${state}|${target}`)
    const url = deps.googleStart?.(target, state)
    if (!url) return reply.code(400).send({ error: 'Google credentials are not configured' })
    return reply.redirect(url)
  })

  app.get('/api/oauth/google/callback', async (request, reply) => {
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string }
    const expected = getSetting(db, 'google_oauth_state') ?? ''
    const [expectedState, connectionId] = expected.split('|')
    if (error || !code || !state || !expectedState || !connectionId || state !== expectedState) {
      return reply.redirect('/?drive=error')
    }
    setSetting(db, 'google_oauth_state', '')
    try {
      await deps.googleComplete?.(connectionId, code)
    } catch (failure) {
      console.error('[google] OAuth exchange failed:', failure)
      return reply.redirect('/?drive=error')
    }
    return reply.redirect('/?drive=connected')
  })
}
