import type { DatabaseSync } from 'node:sqlite'
import type { Config } from '../config.js'
import { buildAttention } from '../attention.js'
import type { Source } from '../sources/types.js'
import { buildDigest } from './digest.js'
import { generateBriefing } from './deepseek.js'
import { digestWindowStart } from './window.js'
import {
  digestWindowHours,
  isExcludedVaultPath,
  isSourceEnabled,
} from '../settings.js'

export type BriefingTrigger = 'auto' | 'manual'
export type BriefingResult = { markdown: string } | { error: string }

type Options = { trigger?: BriefingTrigger; now?: Date; fetchFn?: typeof fetch }

/** One digest section per source kind, however many accounts feed it. */
const EXTRA_TITLES = { mail: 'Mail', calendar: 'Calendar', browser: 'Browser', github: 'GitHub' }

export async function createBriefing(
  db: DatabaseSync,
  sources: Source[],
  config: Config,
  opts: Options = {},
): Promise<BriefingResult> {
  if (!config.deepseekKey) return { error: 'no-key' }

  const now = opts.now ?? new Date()
  const last = db.prepare('SELECT created_at FROM briefings ORDER BY id DESC LIMIT 1').get() as
    | { created_at: string }
    | undefined

  const since = digestWindowStart(
    last ? new Date(last.created_at) : null,
    now,
    digestWindowHours(db),
  )

  const vaultChanges = isSourceEnabled(db, 'vault')
    ? (db
        .prepare('SELECT path, added, removed FROM vault_changes WHERE detected_at >= ?')
        .all(since.toISOString()) as Array<{ path: string; added: number; removed: number }>).filter(
        (change) => !isExcludedVaultPath(db, change.path),
      )
    : []

  const tasks = (
    db
      .prepare('SELECT path, text, done, tag FROM tasks WHERE last_seen >= ?')
      .all(since.toISOString()) as Array<{
      path: string
      text: string
      done: number
      tag: string | null
    }>
  ).filter((task) => !isExcludedVaultPath(db, task.path))

  const driveChanges = isSourceEnabled(db, 'drive')
    ? (db
        .prepare(
          `SELECT COALESCE(f.name, c.file_id) AS name, c.kind FROM drive_changes c
           LEFT JOIN drive_files f ON f.connection_id = c.connection_id AND f.id = c.file_id WHERE c.detected_at >= ?`,
        )
        .all(since.toISOString()) as Array<{ name: string; kind: string }>)
    : []

  const attention = buildAttention(db, now, { staleDays: 14, inboxDays: 3 }).filter(
    (item) =>
      (item.kind !== 'mail' || isSourceEnabled(db, 'mail')) &&
      (item.kind !== 'calendar' || isSourceEnabled(db, 'calendar')) &&
      (item.kind !== 'browser' || isSourceEnabled(db, 'browser')) &&
      (item.kind !== 'github' || isSourceEnabled(db, 'github')) &&
      (!item.path || !isExcludedVaultPath(db, item.path)),
  )

  const extra = Object.entries(EXTRA_TITLES).flatMap(([kind, title]) => {
    if (!isSourceEnabled(db, kind)) return []
    const lines = [
      ...new Set(
        sources
          .filter((source) => source.kind === kind && source.configured())
          .flatMap((source) => source.digest(db, since)),
      ),
    ]
    return lines.length > 0 ? [{ title, lines }] : []
  })

  const digest = buildDigest({
    since,
    now,
    until: now,
    vaultChanges,
    tasks: tasks.map((task) => ({ text: task.text, done: task.done === 1, tag: task.tag })),
    attention,
    driveChanges,
    extra,
  })

  try {
    const markdown = await generateBriefing(config.deepseekKey, digest, opts.fetchFn)
    db.prepare(
      `INSERT INTO briefings (created_at, trigger, markdown, digest_meta) VALUES (?, ?, ?, ?)`,
    ).run(now.toISOString(), opts.trigger ?? 'manual', markdown, JSON.stringify({ since: since.toISOString(), sources: sources.map((source) => source.id) }))
    return { markdown }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
