import type { DatabaseSync } from 'node:sqlite'
import { sanitize } from './digest.js'
import { parseNote } from '../sources/vault/parse.js'

export type ResurfacedNote = { path: string; days: number; excerpt: string }

const TEMPLATES = 'Templates/%'

/** One note comes back at most once a month: a repeating reminder is noise, not memory. */
const RESURFACE_DAYS = 30

/** Body without frontmatter and without leading headings, so the excerpt is actual text. */
function excerptOf(text: string): string {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const line =
    body
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry && !entry.startsWith('#') && !/^- \[[ xX]\]/.test(entry)) ?? ''
  return sanitize(line, 140)
}

/**
 * The oldest note the person has not touched in a while, offered back once a quiet day has
 * nothing else to say. Done notes, templates and hidden folders never come back.
 */
export function resurfaceNote(
  db: DatabaseSync,
  now: Date,
  opts: { minAgeDays: number; exclude: (path: string) => boolean },
): ResurfacedNote | null {
  const cutoff = new Date(now.getTime() - opts.minAgeDays * 86_400_000).toISOString()
  const shownSince = new Date(now.getTime() - RESURFACE_DAYS * 86_400_000).toISOString()
  const shown = new Set(
    (
      db.prepare('SELECT path FROM resurfaced WHERE last_at > ?').all(shownSince) as Array<{
        path: string
      }>
    ).map((row) => row.path),
  )
  const rows = db
    .prepare(
      `SELECT path, mtime, previous_text FROM vault_files
       WHERE mtime <= ? AND path NOT LIKE ? ORDER BY mtime ASC`,
    )
    .all(cutoff, TEMPLATES) as Array<{ path: string; mtime: string; previous_text: string }>

  for (const row of rows) {
    if (shown.has(row.path)) continue
    if (opts.exclude(row.path)) continue
    const status = parseNote(row.previous_text).frontmatter.status
    if (typeof status === 'string' && status.trim().toLowerCase() === 'done') continue
    const excerpt = excerptOf(row.previous_text)
    if (!excerpt) continue
    return {
      path: row.path,
      days: Math.floor((now.getTime() - Date.parse(row.mtime)) / 86_400_000),
      excerpt,
    }
  }
  return null
}
