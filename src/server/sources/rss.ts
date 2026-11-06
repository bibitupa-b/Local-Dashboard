import type { DatabaseSync } from 'node:sqlite'
import { XMLParser } from 'fast-xml-parser'
import { getSetting, setSetting } from '../db/index.js'
import { sanitize } from '../briefing/digest.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

export type RssItem = {
  id: string
  feed: string
  title: string
  link: string
  published: string
  summary: string
}

export type RssApi = { items(): Promise<RssItem[]> }

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    const nested = (value as { '#text'?: unknown })['#text']
    if (typeof nested === 'string' || typeof nested === 'number') return String(nested)
  }
  return ''
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function atomLink(value: unknown): string {
  if (typeof value === 'string') return value
  for (const entry of asArray(value as Record<string, unknown> | Record<string, unknown>[])) {
    if (typeof entry === 'string') return entry
    if (entry && typeof entry === 'object') {
      const href = (entry as { '@_href'?: unknown })['@_href']
      if (typeof href === 'string') return href
    }
  }
  return ''
}

function dateOf(value: unknown): string {
  const parsed = Date.parse(text(value))
  return Number.isNaN(parsed) ? new Date(0).toISOString() : new Date(parsed).toISOString()
}

/** RSS 2.0 and Atom in one shape; a broken item is skipped instead of poisoning the feed. */
export function parseFeed(xml: string, feed: string): RssItem[] {
  const document = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown } }
    feed?: { entry?: unknown }
  }
  const raw = document.rss?.channel?.item ?? document.feed?.entry
  return asArray(raw).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const title = stripHtml(text(item.title))
    const link =
      typeof item.link === 'string'
        ? item.link
        : atomLink(item.link) || text(item.link)
    if (!title || !link) return []
    const published = dateOf(item.pubDate ?? item.published ?? item.updated ?? item.isoDate)
    return [
      {
        id: link,
        feed,
        title: sanitize(title, 160),
        link,
        published,
        summary: sanitize(stripHtml(text(item.description ?? item.summary ?? item.content)), 240),
      },
    ]
  })
}

export function createRssSource(
  api: RssApi | null,
  meta: SourceMeta = sourceMeta('rss', 'rss'),
): Source {
  const connectionId = meta.connectionId
  const syncKey = `last_sync_rss:${connectionId}`
  return {
    ...meta,
    configured: () => api !== null,
    async sync(db, now = new Date()) {
      if (!api) return
      const items = await api.items()
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM rss_items WHERE connection_id = ?').run(connectionId)
        const insert = db.prepare(
          `INSERT OR IGNORE INTO rss_items (connection_id, id, feed, title, link, published, summary)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const item of items) {
          insert.run(
            connectionId,
            item.id,
            item.feed,
            item.title,
            item.link,
            item.published,
            item.summary,
          )
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      setSetting(db, syncKey, now.toISOString())
    },
    lastSync: (db) => getSetting(db, syncKey),
    digest: (db, since) => {
      const rows = db
        .prepare(
          `SELECT title, feed FROM rss_items
           WHERE connection_id = ? AND published >= ?
           ORDER BY published DESC LIMIT 5`,
        )
        .all(connectionId, since.toISOString()) as Array<{ title: string; feed: string }>
      return rows.map((row) => `${sanitize(row.title, 140)} — ${sanitize(row.feed, 60)}`)
    },
  }
}

export function createRssApi(feeds: string[]): RssApi | null {
  const list = [...new Set(feeds.map((feed) => feed.trim()).filter(Boolean))]
  if (list.length === 0) return null
  return {
    async items() {
      const items: RssItem[] = []
      for (const feed of list) {
        try {
          const response = await fetch(feed, {
            headers: { 'user-agent': 'local-dashboard' },
            signal: AbortSignal.timeout(15_000),
          })
          if (!response.ok) throw new Error(`RSS responded ${response.status}`)
          items.push(...parseFeed(await response.text(), feed))
        } catch (error) {
          // One dead feed must not hide the others.
          console.error(`[rss] ${feed} failed:`, error)
        }
      }
      return items
    },
  }
}
