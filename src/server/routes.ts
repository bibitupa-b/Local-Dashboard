import type { DatabaseSync } from 'node:sqlite'
import type { FastifyInstance } from 'fastify'
import type { Config } from './config.js'
import { buildAttention } from './attention.js'
import { createBriefing } from './briefing/index.js'
import type { Source } from './sources/types.js'
import { googleAuthUrl, saveGoogleCode } from './sources/drive.js'
import { getSetting, setSetting } from './db/index.js'

export type RouteDeps = {
  db: DatabaseSync
  config: Config
  sources: Source[]
  generate?: typeof createBriefing
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
      })),
      briefingToday: briefings.some((row) => new Date(row.created_at).toDateString() === today),
    }
  })

  app.get('/api/feed', async (request) => {
    const { days } = request.query as { days?: string }
    return { days: feed(db, Number(days) || 7) }
  })

  app.get('/api/attention', async () =>
    buildAttention(db, new Date(), { staleDays: 14, inboxDays: 3 }),
  )

  app.get('/api/briefings', async (request) => {
    const { limit } = request.query as { limit?: string }
    const items = db
      .prepare('SELECT id, created_at, trigger, markdown FROM briefings ORDER BY id DESC LIMIT ?')
      .all(Math.min(Number(limit) || 10, 50))
    return { items }
  })

  app.post('/api/briefings/generate', async (_request, reply) => {
    const result = await (deps.generate ?? createBriefing)(db, sources, config, {
      trigger: 'manual',
    })
    if ('markdown' in result) return result
    if (result.error === 'no-key') return reply.code(400).send(result)
    return reply.code(502).send(result)
  })

  app.get('/api/settings', async () => ({
    vaultPath: config.vaultPath,
    briefingHour: config.briefingHour,
    hasDeepSeekKey: Boolean(config.deepseekKey),
    googleConfigured: Boolean(config.googleClientId && config.googleClientSecret),
    driveConnected: Boolean(getSetting(db, 'drive_cursor')),
  }))

  app.put('/api/settings', async (request) => {
    const body = request.body as { vaultPath?: string; briefingHour?: number }
    if (typeof body.vaultPath === 'string' && body.vaultPath.trim()) {
      config.vaultPath = body.vaultPath.trim()
      setSetting(db, 'vault_path', config.vaultPath)
    }
    if (typeof body.briefingHour === 'number' && body.briefingHour >= 0 && body.briefingHour <= 23) {
      config.briefingHour = body.briefingHour
      setSetting(db, 'briefing_hour', String(body.briefingHour))
    }
    return { ok: true }
  })

  app.get('/api/oauth/google/start', async (_request, reply) => {
    const url = googleAuthUrl(config)
    if (!url) return reply.code(400).send({ error: 'Google credentials are not configured' })
    return reply.redirect(url)
  })

  app.get('/api/oauth/google/callback', async (request, reply) => {
    const { code } = request.query as { code?: string }
    if (!code) return reply.code(400).send({ error: 'missing code' })
    await saveGoogleCode(config, code)
    return reply.redirect('/')
  })
}
