import type { DatabaseSync } from 'node:sqlite'
import type { Config } from '../config.js'
import { buildAttention, type AttentionItem } from '../attention.js'
import type { Source } from '../sources/types.js'
import { parseModelOutput, renderMarkdown, resolveRefs, type BriefingBody } from './body.js'
import { buildDigest, sanitize } from './digest.js'
import { generateBriefing, systemPrompt, closingPrompt } from './deepseek.js'
import { meetingLinks, parseAttendees } from './related.js'
import { resurfaceNote } from './resurface.js'
import { weeklyCounts } from './weekly.js'
import { digestWindowStart } from './window.js'
import {
  briefingLanguage,
  briefingProfile,
  digestWindowHours,
  isExcludedVaultPath,
  isSourceEnabled,
} from '../settings.js'

export type BriefingTrigger = 'auto' | 'manual'
export type BriefingKind = 'daily' | 'weekly' | 'evening'
export type BriefingResult =
  | { id: number; markdown: string; body: BriefingBody }
  | { error: string }

type Options = {
  trigger?: BriefingTrigger
  kind?: BriefingKind
  now?: Date
  fetchFn?: typeof fetch
}

/** One digest section per source kind, however many accounts feed it. */
const EXTRA_TITLES = { mail: 'Mail', calendar: 'Calendar', browser: 'Browser', github: 'GitHub' }

/** Which pile comes first, in the same order the page uses. */
const START_ORDER: AttentionItem['kind'][] = [
  'reply',
  'mail',
  'task',
  'github',
  'inbox',
  'stale-project',
  'drive',
  'calendar',
  'browser',
]

/** What the briefing may show: only enabled sources, no excluded paths. */
function currentAttention(db: DatabaseSync, now: Date): AttentionItem[] {
  return buildAttention(db, now, { staleDays: 14, inboxDays: 3 }).filter(
    (item) =>
      (item.kind !== 'mail' || isSourceEnabled(db, 'mail')) &&
      (item.kind !== 'calendar' || isSourceEnabled(db, 'calendar')) &&
      (item.kind !== 'browser' || isSourceEnabled(db, 'browser')) &&
      (item.kind !== 'github' || isSourceEnabled(db, 'github')) &&
      (!item.path || !isExcludedVaultPath(db, item.path)),
  )
}

/** Yesterday's headline and suggestion are the parts worth asking the model about again. */
function metaOf(meta: string): { headline: string; resurface: string; suggestion: string } {
  try {
    const parsed = JSON.parse(meta) as {
      headline?: unknown
      resurface?: unknown
      suggestion?: unknown
    }
    return {
      headline: typeof parsed.headline === 'string' ? parsed.headline.slice(0, 200) : '',
      resurface: typeof parsed.resurface === 'string' ? parsed.resurface : '',
      suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : '',
    }
  } catch {
    return { headline: '', resurface: '', suggestion: '' }
  }
}

/** The last few verdicts are a weak signal; one voice is not a signal at all. */
function recentVerdicts(db: DatabaseSync, limit = 3): string {
  const rows = db
    .prepare(
      `SELECT created_at, feedback, body, markdown FROM briefings
       WHERE feedback IS NOT NULL ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    created_at: string
    feedback: string
    body: string | null
    markdown: string
  }>
  if (rows.length < 2) return ''
  return rows
    .map((row) => {
      let headline = ''
      try {
        const parsed = JSON.parse(row.body ?? '') as { headline?: unknown }
        if (typeof parsed.headline === 'string') headline = parsed.headline
      } catch {
        // A broken or missing body falls back to the markdown's first line.
      }
      if (!headline) headline = row.markdown.split('\n')[0] ?? ''
      return `${row.created_at.slice(0, 10)} ${row.feedback} — “${sanitize(headline, 120)}”`
    })
    .join('; ')
}

/**
 * Without a key the page still earns its place: a plain list of what is waiting, no model, no links.
 * A DeepSeek failure is not routed here — a broken key or an empty balance must stay visible.
 */
function rulesBriefing(db: DatabaseSync, now: Date, opts: Options): BriefingResult {
  const attention = currentAttention(db, now)
  const ordered = START_ORDER.flatMap((kind) => attention.filter((item) => item.kind === kind))
  const body: BriefingBody = {
    headline:
      attention.length === 0
        ? 'Quiet day'
        : `${attention.length} thing${attention.length === 1 ? '' : 's'} need you`,
    bullets: ordered.slice(0, 5).map((item) => ({
      // One line per point, whatever a note or a subject tried to smuggle in.
      text: sanitize(`${item.label} — ${item.detail}`, 400),
      refs: [],
    })),
    suggestion: ordered[0] ? `Start with: ${ordered[0].label}` : '',
  }
  const markdown = renderMarkdown(body)
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO briefings (created_at, trigger, markdown, digest, digest_meta, body, kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      now.toISOString(),
      opts.trigger ?? 'manual',
      markdown,
      '',
      JSON.stringify({
        since: now.toISOString(),
        until: now.toISOString(),
        headline: body.headline,
        sources: [],
        model: 'rules',
      }),
      JSON.stringify(body),
      opts.kind ?? 'daily',
    )
  return { id: Number(lastInsertRowid), markdown, body }
}

export async function createBriefing(
  db: DatabaseSync,
  sources: Source[],
  config: Config,
  opts: Options = {},
): Promise<BriefingResult> {
  const now = opts.now ?? new Date()
  if (!config.deepseekKey) return rulesBriefing(db, now, opts)

  const last = db.prepare('SELECT created_at, digest_meta FROM briefings ORDER BY id DESC LIMIT 1').get() as
    | { created_at: string; digest_meta: string }
    | undefined
  const previousHeadline = last ? metaOf(last.digest_meta).headline : ''
  const previousNote = last ? metaOf(last.digest_meta).resurface : ''
  const previousSuggestion = last ? metaOf(last.digest_meta).suggestion : ''

  const since =
    opts.kind === 'weekly'
      ? new Date(now.getTime() - 7 * 86_400_000)
      : opts.kind === 'evening' && last
        ? // The evening pass closes the day: it looks back only to the briefing it follows.
          new Date(last.created_at)
        : digestWindowStart(last ? new Date(last.created_at) : null, now, digestWindowHours(db))

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

  const attention = currentAttention(db, now)

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

  // Meeting prep is the one thing only a local dashboard can do: calendar and mail side by side.
  const meetings =
    isSourceEnabled(db, 'calendar') && isSourceEnabled(db, 'mail')
      ? meetingLinks(
          (
            db
              .prepare(
                `SELECT summary, start, attendees FROM calendar_events
                 WHERE start >= ? AND start <= ? AND status != 'cancelled' ORDER BY start`,
              )
              .all(
                now.toISOString(),
                new Date(now.getTime() + 86_400_000).toISOString(),
              ) as Array<{ summary: string; start: string; attendees: string }>
          ).map((row) => ({ ...row, attendees: parseAttendees(row.attendees) })),
          db
            .prepare(
              `SELECT sender, subject, date FROM mail_messages
               WHERE folder = 'INBOX' AND date >= ? ORDER BY date DESC LIMIT 200`,
            )
            .all(new Date(now.getTime() - 30 * 86_400_000).toISOString()) as Array<{
            sender: string
            subject: string
            date: string
          }>,
          now,
        )
      : []

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
    ...(meetings.length > 0 ? { meetings } : {}),
    previousHeadline,
    ...(previousSuggestion ? { previousSuggestion } : {}),
    ...(opts.kind === 'weekly' ? { previousWindow: weeklyCounts(db, now) } : {}),
    ...(resurface ? { resurface } : {}),
  })

  // Only a note that reached the digest counts as shown: a busy day must not spend the interval.
  const resurfacedShown = resurface !== null && digest.text.includes('## Worth revisiting')

  try {
    const { raw, usage, finishReason } = await generateBriefing(
      config.deepseekKey,
      digest.text,
      {
        ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
        system: `${systemPrompt(briefingLanguage(db), briefingProfile(db), recentVerdicts(db))}${
          opts.kind === 'evening' ? `\n${closingPrompt()}` : ''
        }`,
      },
    )
    const body = resolveRefs(parseModelOutput(raw), digest.refs)
    const markdown = renderMarkdown(body)
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO briefings (created_at, trigger, markdown, digest, digest_meta, body, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
          // Only remember the suggestion if the model made one, so the next digest stays quiet.
          ...(body.suggestion ? { suggestion: body.suggestion } : {}),
          // Only remember the note if the digest actually carried it, so a busy day costs nothing.
          ...(resurfacedShown && resurface ? { resurface: resurface.path } : {}),
          sources: sources.map((source) => source.id),
          model: 'deepseek-chat',
          ...(usage ? { usage } : {}),
          ...(finishReason === 'length' ? { truncated: true } : {}),
        }),
        JSON.stringify(body),
        opts.kind ?? 'daily',
      )
    // The same note waits 30 days before it comes back, however busy the vault gets.
    if (resurfacedShown && resurface) {
      db.prepare(
        `INSERT INTO resurfaced (path, last_at) VALUES (?, ?)
         ON CONFLICT(path) DO UPDATE SET last_at = excluded.last_at`,
      ).run(resurface.path, now.toISOString())
    }
    return { id: Number(lastInsertRowid), markdown, body }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
