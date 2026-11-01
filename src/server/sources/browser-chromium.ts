import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { domainOf, type BrowserReader, type BrowserVisit } from './browser.js'

const CHROME_EPOCH_OFFSET_MS = 11_644_473_600_000
const MAX_VISITS = 5000

export function chromiumMicrosToIso(micros: number | bigint): string {
  return new Date(Number(micros) / 1000 - CHROME_EPOCH_OFFSET_MS).toISOString()
}

export function isoToChromiumMicros(iso: string): number {
  return (Date.parse(iso) + CHROME_EPOCH_OFFSET_MS) * 1000
}

function defaultProfile(): string | null {
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  const candidates = [
    join(local, 'Google', 'Chrome', 'User Data', 'Default', 'History'),
    join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'History'),
  ]
  return candidates.find((path) => existsSync(path)) ?? null
}

export function createChromiumBrowserReader(
  dataDir: string,
  explicitPath?: string | null,
): BrowserReader | null {
  const source = explicitPath || defaultProfile()
  if (!source || !existsSync(source)) return null

  return {
    path: source,
    async visitsSince(iso, limit = MAX_VISITS) {
      // Chromium keeps the live database locked; read a throwaway copy instead.
      const tempDir = join(dataDir, 'tmp')
      mkdirSync(tempDir, { recursive: true })
      const copy = join(tempDir, 'browser-history.db')
      copyFileSync(source, copy)

      const db = new DatabaseSync(copy, { readOnly: true })
      try {
        const rows = db
          .prepare(
            `SELECT url, title, last_visit_time AS visited
             FROM urls WHERE last_visit_time > ? ORDER BY last_visit_time ASC LIMIT ?`,
          )
          .all(iso ? isoToChromiumMicros(iso) : 0, limit) as Array<{
          url: string
          title: string | null
          visited: number
        }>

        const visits: BrowserVisit[] = []
        for (const row of rows) {
          const domain = domainOf(row.url)
          if (!domain) continue
          visits.push({
            url: row.url,
            domain,
            title: row.title ?? '',
            visitedAt: chromiumMicrosToIso(row.visited),
          })
        }
        return visits
      } finally {
        db.close()
      }
    },
  }
}
