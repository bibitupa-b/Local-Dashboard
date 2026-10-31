import type { DatabaseSync } from 'node:sqlite'
import type { Config } from '../config.js'
import { buildAttention } from '../attention.js'
import type { Source } from '../sources/types.js'
import { buildDigest } from './digest.js'
import { generateBriefing } from './deepseek.js'

export type BriefingTrigger = 'auto' | 'manual'
export type BriefingResult = { markdown: string } | { error: string }

type Options = { trigger?: BriefingTrigger; now?: Date; fetchFn?: typeof fetch }

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
  const since = last ? new Date(last.created_at) : new Date(now.getTime() - 86_400_000)

  const vaultChanges = db
    .prepare('SELECT path, added, removed FROM vault_changes WHERE detected_at >= ?')
    .all(since.toISOString()) as Array<{ path: string; added: number; removed: number }>

  const tasks = db
    .prepare('SELECT text, done, tag FROM tasks WHERE last_seen >= ?')
    .all(since.toISOString()) as Array<{ text: string; done: number; tag: string | null }>

  const driveChanges = db
    .prepare(
      `SELECT COALESCE(f.name, c.file_id) AS name, c.kind FROM drive_changes c
       LEFT JOIN drive_files f ON f.id = c.file_id WHERE c.detected_at >= ?`,
    )
    .all(since.toISOString()) as Array<{ name: string; kind: string }>

  const digest = buildDigest({
    since,
    vaultChanges,
    tasks: tasks.map((task) => ({ text: task.text, done: task.done === 1, tag: task.tag })),
    attention: buildAttention(db, now, { staleDays: 14, inboxDays: 3 }),
    driveChanges,
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
