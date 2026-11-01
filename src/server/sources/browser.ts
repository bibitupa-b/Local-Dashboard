import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from '../db/index.js'
import { getList, LIST_KEYS } from '../settings.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

export type BrowserVisit = { url: string; domain: string; title: string; visitedAt: string }
export type BrowserReader = {
  path: string
  visitsSince(iso: string | null, limit?: number): Promise<BrowserVisit[]>
}

export function domainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return null
  }
}

export function isExcludedDomain(db: DatabaseSync, domain: string): boolean {
  return getList(db, LIST_KEYS.browserDomains).some((pattern) => domain.includes(pattern))
}

export function createBrowserSource(reader: BrowserReader | null, meta: SourceMeta = sourceMeta('browser', 'browser')): Source {
  const connectionId = meta.connectionId
  const cursorKey = `browser_cursor:${connectionId}`
  const syncKey = `last_sync_browser:${connectionId}`
  return {
    ...meta,
    configured: () => reader !== null,
    async sync(db, now = new Date()) {
      if (!reader) return
      const cursor = getSetting(db, cursorKey)
      const visits = await reader.visitsSince(cursor ?? null)

      const insert = db.prepare(
        `INSERT OR IGNORE INTO browser_visits (connection_id, url, domain, title, visited_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      let newest = cursor
      for (const visit of visits) {
        if (!newest || visit.visitedAt > newest) newest = visit.visitedAt
        if (isExcludedDomain(db, visit.domain)) continue
        insert.run(connectionId, visit.url, visit.domain, visit.title, visit.visitedAt)
      }
      if (newest) setSetting(db, cursorKey, newest)
      setSetting(db, syncKey, now.toISOString())
    },
    lastSync: (db) => getSetting(db, syncKey),
    digest: (db, since) => {
      const rows = db
        .prepare(
          `SELECT domain, COUNT(*) AS n FROM browser_visits
           WHERE visited_at >= ? GROUP BY domain ORDER BY n DESC LIMIT 5`,
        )
        .all(since.toISOString()) as Array<{ domain: string; n: number }>
      if (rows.length === 0) return ['No browsing recorded']
      const total = rows.reduce((sum, row) => sum + row.n, 0)
      return [`Browsing: ${total} visits`, ...rows.map((row) => `${row.domain} (${row.n})`)]
    },
  }
}
