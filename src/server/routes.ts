import type { DatabaseSync } from 'node:sqlite'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Config } from './config.js'
import { visibleActivity, visibleAttention } from './attention.js'
import { createBriefing } from './briefing/index.js'
import { claimBriefing, releaseBriefing } from './briefing/lock.js'
import { answerPrompt, generateBriefing } from './briefing/deepseek.js'
import type { Source } from './sources/types.js'
import { todayEvents, dayPlan, workHours } from './sources/calendar.js'
import type { HealthMap, SyncState } from './health.js'
import { getSetting, setSetting } from './db/index.js'
import {
  LIST_KEYS,
  MAX_PROFILE_CHARS,
  briefingLanguage,
  isExcludedFolder,
  isExcludedSender,
  isExcludedVaultPath,
  isSourceEnabled,
  briefingProfile,
  digestWindowHours,
  getList,
  normalizeVaultPrefixes,
  setList,
  wallpaper,
  WALLPAPER_IDS,
  appearance,
  setAppearance,
  widgetLayout,
  setWidgetLayout,
  groundingStrict,
  isLocalOnly,
  setLocalOnly,
  type Appearance,
} from './settings.js'
import type { ConnectionInput } from './connections.js'
import { hasSearchIndex, searchMatch } from './search-index.js'
import { retention } from './retention.js'

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
  ask?: (digest: string, question: string) => Promise<string>
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

/** A failed generation is remembered so the page can show it; a broken value reads as no failure. */
function readBriefingError(db: DatabaseSync): { at: string; message: string } | null {
  const raw = getSetting(db, 'briefing_last_error')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { at?: unknown; message?: unknown }
    return typeof parsed.at === 'string' && typeof parsed.message === 'string'
      ? { at: parsed.at, message: parsed.message }
      : null
  } catch {
    return null
  }
}

/** A broken stored body reads as "no body": the page then falls back to the markdown. */
function parseBody(raw: string | null): unknown {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { headline?: unknown; bullets?: unknown }
    const shaped =
      typeof parsed?.headline === 'string' &&
      Array.isArray(parsed.bullets) &&
      parsed.bullets.every((bullet) => {
        const entry = bullet as { text?: unknown; refs?: unknown }
        return typeof entry?.text === 'string' && Array.isArray(entry.refs)
      })
    return shaped ? parsed : null
  } catch {
    return null
  }
}

function parseMeta(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** One question, one answer, built only from the digest the reader already saw. */
async function answerFromDigest(key: string, digest: string, question: string): Promise<string> {
  const { raw } = await generateBriefing(key, `Digest:\n${digest}\n\nQuestion: ${question}`, {
    system: answerPrompt(),
    json: false,
  })
  return raw
}

const DATA_TABLES = [
  'vault_files',
  'vault_changes',
  'tasks',
  'mail_folders',
  'mail_messages',
  'drive_files',
  'drive_changes',
  'drive_doc_text',
  'weather_daily',
  'rss_items',
  'google_tasks',
  'slack_mentions',
  'calendar_events',
  'browser_visits',
  'github_items',
  'teams_mentions',
  'briefings',
  'briefing_feedback',
  'resurfaced',
] as const

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, config } = deps
  const sourceList = (): Source[] =>
    typeof deps.sources === 'function' ? deps.sources() : deps.sources

  app.get('/api/health', async () => ({ ok: true }))

  app.get('/api/status', async () => {
    const today = new Date().toDateString()
    const briefings = db.prepare('SELECT created_at, kind FROM briefings').all() as Array<{
      created_at: string
      kind: string
    }>
    const kindsToday = [
      ...new Set(
        briefings
          .filter((row) => new Date(row.created_at).toDateString() === today)
          .map((row) => row.kind),
      ),
    ]
    return {
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '',
      localOnly: isLocalOnly(db),
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
      briefingToday: kindsToday.includes('daily'),
      briefingKindsToday: kindsToday,
      briefingError: readBriefingError(db),
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
    visibleAttention(db, new Date(), { staleDays: 14, inboxDays: 3 }),
  )

  app.get('/api/activity', async () => visibleActivity(db, new Date()))

  app.get('/api/briefings/stats', async (request) => {
    const { days } = request.query as { days?: string }
    const window = Math.min(Math.max(Number(days) || 7, 1), 90)
    const since = new Date(Date.now() - window * 86_400_000).toISOString()
    const rows = db
      .prepare('SELECT opens, feedback, digest_meta FROM briefings WHERE created_at >= ?')
      .all(since) as Array<{ opens: number; feedback: string | null; digest_meta: string }>
    let opens = 0
    let useful = 0
    let miss = 0
    let prompt = 0
    let completion = 0
    let usageKnown = 0
    for (const row of rows) {
      opens += row.opens
      if (row.feedback === 'useful') useful++
      if (row.feedback === 'miss') miss++
      try {
        const meta = JSON.parse(row.digest_meta) as {
          usage?: { prompt?: number; completion?: number }
        }
        if (meta.usage) {
          prompt += meta.usage.prompt ?? 0
          completion += meta.usage.completion ?? 0
          usageKnown++
        }
      } catch {
        // An old or broken meta row is simply left out of the token total.
      }
    }
    return {
      days: window,
      count: rows.length,
      opens,
      useful,
      miss,
      tokens: { prompt, completion },
      usageKnown,
    }
  })

  app.get('/api/briefings', async (request) => {
    const { limit } = request.query as { limit?: string }
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50)
    const items = (
      db
        .prepare(
          'SELECT id, created_at, trigger, kind, markdown, digest, body, digest_meta, feedback, opens FROM briefings ORDER BY id DESC LIMIT ?',
        )
        .all(safeLimit) as Array<{
        id: number
        created_at: string
        trigger: string
        kind: string
        markdown: string
        digest: string
        body: string | null
        digest_meta: string
        feedback: string | null
        opens: number
      }>
    ).map((row) => ({ ...row, body: parseBody(row.body), digest_meta: parseMeta(row.digest_meta) }))
    return { items }
  })

  app.post('/api/briefings/:id/feedback', async (request, reply) => {
    const { id } = request.params as { id: string }
    const value = ((request.body ?? {}) as { value?: unknown }).value
    if (value !== null && value !== 'useful' && value !== 'miss') {
      return reply.code(400).send({ error: 'value must be useful, miss or null' })
    }
    const { changes } = db
      .prepare('UPDATE briefings SET feedback = ? WHERE id = ?')
      .run(value, Number(id))
    if (changes === 0) return reply.code(404).send({ error: 'not found' })
    return { ok: true }
  })

  app.post('/api/briefings/:id/bullets/:index/feedback', async (request, reply) => {
    const { id, index } = request.params as { id: string; index: string }
    const value = ((request.body ?? {}) as { value?: unknown }).value
    if (value !== null && value !== 'useful' && value !== 'miss') {
      return reply.code(400).send({ error: 'value must be useful, miss or null' })
    }
    const briefingId = Number(id)
    const bulletIndex = Number(index)
    if (!Number.isInteger(briefingId) || !Number.isInteger(bulletIndex) || bulletIndex < 0) {
      return reply.code(400).send({ error: 'invalid briefing or bullet index' })
    }
    const exists = db.prepare('SELECT 1 FROM briefings WHERE id = ?').get(briefingId)
    if (!exists) return reply.code(404).send({ error: 'not found' })
    if (value === null) {
      db.prepare('DELETE FROM briefing_feedback WHERE briefing_id = ? AND bullet_index = ?').run(
        briefingId,
        bulletIndex,
      )
    } else {
      db.prepare(
        `INSERT INTO briefing_feedback (briefing_id, bullet_index, value, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(briefing_id, bullet_index) DO UPDATE SET value = excluded.value,
           created_at = excluded.created_at`,
      ).run(briefingId, bulletIndex, value, new Date().toISOString())
    }
    return { ok: true }
  })

  app.post('/api/briefings/:id/opened', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { changes } = db
      .prepare('UPDATE briefings SET opens = opens + 1 WHERE id = ?')
      .run(Number(id) || 0)
    if (changes === 0) return reply.code(404).send({ error: 'not found' })
    return { ok: true }
  })

  app.post('/api/briefings/generate', async (_request, reply) => {
    if (deps.isReady && !deps.isReady()) {
      return reply.code(503).send({ error: 'sources are still syncing, try again in a minute' })
    }
    if (!claimBriefing()) return reply.code(429).send({ error: 'briefing is already being generated' })
    try {
      const result = await (deps.generate ?? createBriefing)(db, sourceList(), config, {
        trigger: 'manual',
      })
      if ('markdown' in result) return result
      if (result.error === 'no-key') return reply.code(400).send(result)
      return reply.code(502).send(result)
    } finally {
      releaseBriefing()
    }
  })

  let asking = false
  app.post('/api/briefings/:id/ask', async (request, reply) => {
    const { id } = request.params as { id: string }
    const question = String(
      ((request.body ?? {}) as { question?: unknown }).question ?? '',
    )
      .trim()
      .slice(0, 200)
    if (!question) return reply.code(400).send({ error: 'question is required' })
    const row = db.prepare('SELECT digest FROM briefings WHERE id = ?').get(Number(id) || 0) as
      | { digest: string }
      | undefined
    if (!row || !row.digest.trim()) return reply.code(404).send({ error: 'not found' })
    if (!config.deepseekKey) return reply.code(400).send({ error: 'no-key' })
    if (asking) return reply.code(429).send({ error: 'an answer is already being written' })
    asking = true
    try {
      const answer = deps.ask
        ? await deps.ask(row.digest, question)
        : await answerFromDigest(config.deepseekKey, row.digest, question)
      return { answer }
    } catch (error) {
      return reply
        .code(502)
        .send({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      asking = false
    }
  })

  app.get('/api/today', async () => {
    const now = new Date()
    const events = todayEvents(db, now)
    const hours = workHours(db)
    return { events, ...dayPlan(events, now, hours), workHours: hours }
  })

  app.get('/api/search', async (request) => {
    const { q, source, from, to } = request.query as {
      q?: string
      source?: string
      from?: string
      to?: string
    }
    const term = (q ?? '').trim()
    if (term.length < 2) return { notes: [], mail: [], drive: [] }

    if (hasSearchIndex(db)) {
      const match = searchMatch(term)
      if (!match) return { notes: [], mail: [], drive: [] }
      const rows = db
        .prepare(
          `SELECT source, ref, title, body, date, meta, rank FROM search_fts
           WHERE search_fts MATCH ? ORDER BY rank LIMIT 60`,
        )
        .all(match) as Array<{
        source: 'note' | 'mail' | 'drive'
        ref: string
        title: string
        body: string
        date: string
        meta: string
        rank: number
      }>

      const notes: Array<{ path: string; snippet: string }> = []
      const mail: Array<{
        sender: string
        subject: string
        date: string
        messageId: string | null
      }> = []
      const drive: Array<{
        id: string
        name: string
        modifiedTime: string
        snippet: string | null
      }> = []
      const seen = new Set<string>()

      for (const row of rows) {
        if (source && row.source !== source) continue
        if (from && row.date < from) continue
        if (to && row.date > to) continue
        const key = `${row.source}:${row.ref}`
        if (seen.has(key)) continue
        seen.add(key)
        if (row.source === 'note') {
          if (!isSourceEnabled(db, 'vault') || isExcludedVaultPath(db, row.ref)) continue
          if (notes.length < 10) notes.push({ path: row.ref, snippet: snippet(row.body, term) })
        } else if (row.source === 'mail') {
          if (!isSourceEnabled(db, 'mail')) continue
          let meta: { sender?: string; messageId?: string | null; folder?: string } = {}
          try {
            meta = JSON.parse(row.meta) as typeof meta
          } catch {
            // A broken meta row still has the subject and date.
          }
          if (isExcludedSender(db, meta.sender ?? '')) continue
          if (meta.folder && isExcludedFolder(db, meta.folder)) continue
          if (mail.length < 10) {
            mail.push({
              sender: meta.sender ?? '',
              subject: row.title,
              date: row.date,
              messageId: meta.messageId ?? null,
            })
          }
        } else if (row.source === 'drive' && isSourceEnabled(db, 'drive')) {
          if (drive.length < 10) {
            drive.push({
              id: row.ref,
              name: row.title,
              modifiedTime: row.date,
              snippet: row.body ? snippet(row.body, term) : null,
            })
          }
        }
      }
      return { notes, mail, drive }
    }

    // Older databases or a failed FTS build keep the original LIKE path working.
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`
    const notes = isSourceEnabled(db, 'vault')
      ? (
          db
            .prepare(
              `SELECT path, previous_text AS text FROM vault_files
               WHERE path LIKE ? ESCAPE '\\' OR previous_text LIKE ? ESCAPE '\\'
               ORDER BY mtime DESC LIMIT 10`,
            )
            .all(like, like) as Array<{ path: string; text: string }>
        )
          .filter((row) => !isExcludedVaultPath(db, row.path))
          .map((row) => ({ path: row.path, snippet: snippet(row.text, term) }))
      : []

    const mail = isSourceEnabled(db, 'mail')
      ? (
          db
            .prepare(
              `SELECT sender, subject, date, folder, message_id AS messageId FROM mail_messages
               WHERE subject LIKE ? ESCAPE '\\' OR sender LIKE ? ESCAPE '\\' OR snippet LIKE ? ESCAPE '\\'
               GROUP BY COALESCE(message_id, folder || ':' || uid)
               ORDER BY MAX(date) DESC LIMIT 10`,
            )
            .all(like, like, like) as Array<{
            sender: string
            subject: string
            date: string
            folder: string
            messageId: string | null
          }>
        ).filter(
          (row) => !isExcludedSender(db, row.sender) && !isExcludedFolder(db, row.folder),
        )
      : []

    const drive = isSourceEnabled(db, 'drive')
      ? db
          .prepare(
            `SELECT f.id, f.name, f.modified_time AS modifiedTime,
                    (SELECT substr(d.text, 1, 160) FROM drive_doc_text d WHERE d.file_id = f.id) AS snippet
             FROM drive_files f
             WHERE f.name LIKE ? ESCAPE '\\'
                OR EXISTS (SELECT 1 FROM drive_doc_text d WHERE d.file_id = f.id AND d.text LIKE ? ESCAPE '\\')
             ORDER BY f.modified_time DESC LIMIT 10`,
          )
          .all(like, like)
      : []

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

  app.get('/api/export', async () => {
    const briefings = db
      .prepare(
        'SELECT id, created_at, trigger, kind, markdown, feedback, opens, digest_meta FROM briefings ORDER BY id',
      )
      .all() as Array<Record<string, unknown>>
    const settings = Object.fromEntries(
      (
        db.prepare('SELECT key, value FROM settings').all() as Array<{
          key: string
          value: string
        }>
      )
        .filter((row) => row.key !== 'google_oauth_state')
        .map((row) => [row.key, row.value]),
    )
    const connections = (deps.connections?.list() ?? []).map((connection) => ({
      id: connection.id,
      service: connection.service,
      label: connection.label,
      enabled: connection.enabled,
      createdAt: connection.createdAt,
    }))
    const counts = Object.fromEntries(
      DATA_TABLES.map((table) => [
        table,
        (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n,
      ]),
    )
    return {
      exportedAt: new Date().toISOString(),
      version: process.env.APP_VERSION ?? process.env.npm_package_version ?? '',
      briefings: briefings.map((row) => ({
        ...row,
        digest_meta: parseMeta(String(row.digest_meta ?? '{}')),
      })),
      settings,
      connections,
      counts,
    }
  })

  app.delete('/api/data', async () => {
    db.exec('BEGIN')
    try {
      for (const table of DATA_TABLES) db.prepare(`DELETE FROM "${table}"`).run()
      db.prepare('DELETE FROM settings').run()
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { ok: true }
  })

  app.get('/api/settings', async () => {
    const connections = deps.connections?.list() ?? []
    const has = (service: string) => connections.some((row) => row.service === service)
    return {
      vaultPath:
        deps.connections?.list().find((row) => row.service === 'vault')?.config.path ??
        config.vaultPath,
      briefingHour: config.briefingHour,
      workStart: workHours(db).start,
      workEnd: workHours(db).end,
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
      briefingLanguage: briefingLanguage(db),
      briefingProfile: briefingProfile(db),
      eveningPass: getSetting(db, 'evening_pass') === '1',
      meetingPrep: getSetting(db, 'meeting_prep') !== '0',
      mailBodyDays: retention(db).mailBodyDays,
      browserDays: retention(db).browserDays,
      vaultChangeDays: retention(db).vaultChangeDays,
      enabledSources: getList(db, 'enabled_sources'),
      wallpaper: wallpaper(db),
      appearance: appearance(db),
      widgets: widgetLayout(db),
      groundingStrict: groundingStrict(db),
      localOnly: isLocalOnly(db),
      dataDir: config.dataDir,
    }
  })

  app.get('/api/connections', async () => {
    const sources = sourceList()
    const health = deps.health?.() ?? {}
    const items = (deps.connections?.list() ?? []).map((connection) => {
      const related = sources.filter((source) => source.connectionId === connection.id)
      const lastSync =
        related
          .map((source) => source.lastSync(db))
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null
      const sourceError = related
        .map((source) => health[source.id]?.lastError)
        .find((value): value is string => Boolean(value))
      return {
        ...connection,
        configured: related.some((source) => source.configured()),
        lastSync,
        lastError: connection.lastError ?? sourceError ?? null,
      }
    })
    return { items }
  })

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
    if (isLocalOnly(db)) {
      return { ok: false, error: 'Local only is on. Turn it off to test this connection.' }
    }
    const { id } = request.params as { id: string }
    return deps.connections.test(id)
  })

  app.put('/api/settings', async (request) => {
    const body = (request.body ?? {}) as {
      briefingHour?: number
      workStart?: number
      workEnd?: number
      excludedSenders?: string[]
      excludedMailFolders?: string[]
      excludedVaultPrefixes?: string[]
      excludedBrowserDomains?: string[]
      digestWindowHours?: number
      briefingLanguage?: string
      briefingProfile?: string
      eveningPass?: boolean
      meetingPrep?: boolean
      mailBodyDays?: number
      browserDays?: number
      vaultChangeDays?: number
      enabledSources?: string[]
      wallpaper?: string
      appearance?: Partial<Appearance>
      widgets?: unknown
      groundingStrict?: boolean
      localOnly?: boolean
    }
    if (typeof body.briefingHour === 'number' && body.briefingHour >= 0 && body.briefingHour <= 23) {
      config.briefingHour = body.briefingHour
      setSetting(db, 'briefing_hour', String(body.briefingHour))
    }
    if (
      typeof body.workStart === 'number' ||
      typeof body.workEnd === 'number'
    ) {
      const current = workHours(db)
      const start = body.workStart ?? current.start
      const end = body.workEnd ?? current.end
      if (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        end <= 23 &&
        start < end
      ) {
        setSetting(db, 'work_start', String(start))
        setSetting(db, 'work_end', String(end))
      }
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
    if (body.briefingLanguage && ['auto', 'ru', 'en'].includes(body.briefingLanguage)) {
      setSetting(db, 'briefing_language', body.briefingLanguage)
    }
    if (typeof body.briefingProfile === 'string') {
      setSetting(db, 'briefing_profile', body.briefingProfile.slice(0, MAX_PROFILE_CHARS))
    }
    if (typeof body.eveningPass === 'boolean') {
      setSetting(db, 'evening_pass', body.eveningPass ? '1' : '0')
    }
    if (typeof body.meetingPrep === 'boolean') {
      setSetting(db, 'meeting_prep', body.meetingPrep ? '1' : '0')
    }
    for (const [key, value] of [
      ['mail_body_days', body.mailBodyDays],
      ['browser_days', body.browserDays],
      ['vault_change_days', body.vaultChangeDays],
    ] as const) {
      if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3650) {
        setSetting(db, key, String(value))
      }
    }
    if (typeof body.wallpaper === 'string' && (WALLPAPER_IDS as readonly string[]).includes(body.wallpaper)) {
      setSetting(db, 'wallpaper', body.wallpaper)
    }
    if (body.appearance && typeof body.appearance === 'object') {
      setAppearance(db, body.appearance)
    }
    if (body.widgets !== undefined) setWidgetLayout(db, body.widgets)
    if (typeof body.groundingStrict === 'boolean') {
      setSetting(db, 'grounding_strict', body.groundingStrict ? '1' : '0')
    }
    if (typeof body.localOnly === 'boolean') {
      setLocalOnly(db, body.localOnly)
      await deps.reload?.()
    }
    return { ok: true }
  })

  app.get('/api/oauth/google/start', async (request, reply) => {
    if (isLocalOnly(db)) {
      return reply
        .code(409)
        .send({ error: 'Local only is on. Turn it off to connect Google.' })
    }
    const { connection } = request.query as { connection?: string }
    const target =
      connection ?? deps.connections?.list().find((row) => row.service === 'google')?.id
    if (!target) return reply.code(400).send({ error: 'No Google connection configured' })
    const state = randomBytes(16).toString('hex')
    setSetting(db, 'google_oauth_state', `${state}|${target}`)
    const url = deps.googleStart?.(target, state)
    if (!url) return reply.code(400).send({ error: 'Google credentials are not configured' })
    console.log('[google] oauth start', target, new URL(url).searchParams.get('redirect_uri'))
    return reply.redirect(url)
  })

  app.get('/api/oauth/google/callback', async (request, reply) => {
    if (isLocalOnly(db)) {
      return reply
        .code(409)
        .send({ error: 'Local only is on. Turn it off to connect Google.' })
    }
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string }
    const expected = getSetting(db, 'google_oauth_state') ?? ''
    const [expectedState, connectionId] = expected.split('|')
    console.log(
      '[google] oauth callback',
      error ? `error=${error}` : 'code received',
      `stateMatches=${Boolean(expectedState) && state === expectedState}`,
    )
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
    console.log('[google] oauth connected', connectionId)
    return reply.redirect('/?drive=connected')
  })
}
