import type { DatabaseSync } from 'node:sqlite'
import type { Config } from '../config.js'
import { buildAttention } from '../attention.js'
import type { Source } from '../sources/types.js'
import { parseModelOutput, renderMarkdown, resolveRefs, type BriefingBody } from './body.js'
import { buildDigest } from './digest.js'
import { generateBriefing, systemPrompt } from './deepseek.js'
import { resurfaceNote } from './resurface.js'
import { digestWindowStart } from './window.js'
import {
  briefingLanguage,
  digestWindowHours,
  isExcludedVaultPath,
  isSourceEnabled,
} from '../settings.js'

export type BriefingTrigger = 'auto' | 'manual'
export type BriefingResult =
  | { id: number; markdown: string; body: BriefingBody }
  | { error: string }

type Options = { trigger?: BriefingTrigger; now?: Date; fetchFn?: typeof fetch }

/** One digest section per source kind, however many accounts feed it. */
const EXTRA_TITLES = { mail: 'Mail', calendar: 'Calendar', browser: 'Browser', github: 'GitHub' }

/** The previous briefing's headline is the only part of yesterday worth repeating whole. */
function metaOf(meta: string): { headline: string; resurface: string } {
  try {
    const parsed = JSON.parse(meta) as { headline?: unknown; resurface?: unknown }
    return {
      headline: typeof parsed.headline === 'string' ? parsed.headline.slice(0, 200) : '',
      resurface: typeof parsed.resurface === 'string' ? parsed.resurface : '',
    }
  } catch {
    return { headline: '', resurface: '' }
  }
}

export async function createBriefing(
  db: DatabaseSync,
  sources: Source[],
  config: Config,
  opts: Options = {},
): Promise<BriefingResult> {
  if (!config.deepseekKey) return { error: 'no-key' }

  const now = opts.now ?? new Date()
  const last = db.prepare('SELECT created_at, digest_meta FROM briefings ORDER BY id DESC LIMIT 1').get() as
    | { created_at: string; digest_meta: string }
    | undefined
  const previousHeadline = last ? metaOf(last.digest_meta).headline : ''
  const previousNote = last ? metaOf(last.digest_meta).resurface : ''

  const since = digestWindowStart(
    last ? new Date(last.created_at) : null,
    now,
    digestWindowHours(db),
  )

  const vaultChanges = isSourceEnabled(db, 'vault')
    ? (db
        .prepare(
          `SELECT path, SUM(added) AS added, SUM(removed) AS removed FROM vault_changes
           WHERE detected_at >= ? GROUP BY path
           ORDER BY SUM(added) + SUM(removed) DESC LIMIT 40`,
        )
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
          `SELECT COALESCE(f.name, c.file_id) AS name, MAX(c.kind) AS kind, c.file_id AS fileId
           FROM drive_changes c
           LEFT JOIN drive_files f ON f.connection_id = c.connection_id AND f.id = c.file_id
           WHERE c.detected_at >= ? GROUP BY c.file_id
           ORDER BY MAX(c.detected_at) DESC LIMIT 20`,
        )
        .all(since.toISOString()) as Array<{ name: string; kind: string; fileId: string }>)
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

  const resurface = isSourceEnabled(db, 'vault')
    ? resurfaceNote(db, now, {
        minAgeDays: 30,
        exclude: (path) => path === previousNote || isExcludedVaultPath(db, path),
      })
    : null

  const digest = buildDigest({
    since,
    now,
    until: now,
    vaultChanges,
    tasks: tasks.map((task) => ({
      text: task.text,
      done: task.done === 1,
      tag: task.tag,
      path: task.path,
    })),
    attention,
    driveChanges,
    extra,
    previousHeadline,
    ...(resurface ? { resurface } : {}),
  })

  try {
    const { raw, usage, finishReason } = await generateBriefing(
      config.deepseekKey,
      digest.text,
      {
        ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
        system: systemPrompt(briefingLanguage(db)),
      },
    )
    const body = resolveRefs(parseModelOutput(raw), digest.refs)
    const markdown = renderMarkdown(body)
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO briefings (created_at, trigger, markdown, digest, digest_meta, body)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now.toISOString(),
        opts.trigger ?? 'manual',
        markdown,
        digest.text,
        JSON.stringify({
          since: since.toISOString(),
          until: now.toISOString(),
          headline: body.headline,
          // Only remember the note if the digest actually carried it, so a busy day costs nothing.
          ...(resurface && digest.text.includes('## Worth revisiting')
            ? { resurface: resurface.path }
            : {}),
          sources: sources.map((source) => source.id),
          model: 'deepseek-chat',
          ...(usage ? { usage } : {}),
          ...(finishReason === 'length' ? { truncated: true } : {}),
        }),
        JSON.stringify(body),
      )
    return { id: Number(lastInsertRowid), markdown, body }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
