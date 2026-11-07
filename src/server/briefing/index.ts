import type { DatabaseSync } from 'node:sqlite'
import type { Config } from '../config.js'
import { visibleAttention, type AttentionItem } from '../attention.js'
import type { Source } from '../sources/types.js'
import { parseModelOutput, renderMarkdown, resolveRefs, groundParsed, type BriefingBody } from './body.js'
import { buildDigest, sanitize } from './digest.js'
import { generateBriefing, systemPrompt, closingPrompt, verifyBriefing } from './deepseek.js'
import { meetingLinks, parseAttendees } from './related.js'
import { resurfaceNote } from './resurface.js'
import { weeklyCounts } from './weekly.js'
import { digestWindowStart } from './window.js'
import { todayEvents } from '../sources/calendar.js'
import {
  briefingLanguage,
  briefingProfile,
  digestWindowHours,
  isExcludedSender,
  isExcludedVaultPath,
  isSourceEnabled,
  groundingStrict,
  isLocalOnly,
} from '../settings.js'

export type BriefingTrigger = 'auto' | 'manual'
export type BriefingKind = 'daily' | 'weekly' | 'evening'
export type BriefingResult =
  | {
      id: number
      markdown: string
      body: BriefingBody
      digest: string
      digestMeta: Record<string, unknown>
    }
  | { error: string }

type Options = {
  trigger?: BriefingTrigger
  kind?: BriefingKind
  now?: Date
  fetchFn?: typeof fetch
}

/** One digest section per source kind, however many accounts feed it. */
const EXTRA_TITLES = {
  weather: 'Weather',
  calendar: 'Calendar',
  tasks: 'Google Tasks',
  slack: 'Slack',
  rss: 'News',
  mail: 'Mail',
  github: 'GitHub',
  browser: 'Browser',
}

/** Which pile comes first, in the same order the page uses. */
const START_ORDER: AttentionItem['kind'][] = [
  'reply',
  'mail',
  'task',
  'google-task',
  'slack',
  'github',
  'inbox',
  'stale-project',
  'calendar',
]

/** What the briefing may show: only enabled sources, no excluded paths. */
function currentAttention(db: DatabaseSync, now: Date): AttentionItem[] {
  return visibleAttention(db, now, { staleDays: 14, inboxDays: 3 }).filter(
    (item) => !item.path || !isExcludedVaultPath(db, item.path),
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
  const overall =
    rows.length < 2
      ? ''
      : rows
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

  const points = db
    .prepare(
      `SELECT value, bullet_index, created_at FROM briefing_feedback
       ORDER BY created_at DESC LIMIT 6`,
    )
    .all() as Array<{ value: string; bullet_index: number; created_at: string }>
  const pointSignal =
    points.length < 2
      ? ''
      : points
          .map((row) => `${row.created_at.slice(0, 10)} point ${row.bullet_index + 1} ${row.value}`)
          .join('; ')
  return [overall, pointSignal].filter(Boolean).join('; ')
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
  const digestMeta = {
    since: now.toISOString(),
    until: now.toISOString(),
    headline: body.headline,
    sources: [],
    model: 'rules',
  }
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
      JSON.stringify(digestMeta),
      JSON.stringify(body),
      opts.kind ?? 'daily',
    )
  return { id: Number(lastInsertRowid), markdown, body, digest: '', digestMeta }
}

/** The first added lines of the newest diff: one sentence the model can actually reason about. */
function diffExcerpt(db: DatabaseSync, path: string, since: Date): string | undefined {
  const row = db
    .prepare(
      `SELECT diff FROM vault_changes
       WHERE path = ? AND detected_at >= ? AND diff != ''
       ORDER BY id DESC LIMIT 1`,
    )
    .get(path, since.toISOString()) as { diff: string } | undefined
  if (!row?.diff) return undefined
  const added = row.diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1).trim())
    .filter(Boolean)
  // Headings, tables, quotes and frontmatter describe structure, not what was written.
  const substance = added.filter(
    (line) =>
      line.length >= 24 &&
      !/^(#{1,6}\s|>|\||-{3,}|[A-Za-z_]+:)/.test(line) &&
      !/^[-*]\s/.test(line),
  )
  const text = (substance.length > 0 ? substance : added)
    .join(' ')
    .replace(/[*_`>]/g, '')
    .replace(/\[\[|\]\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, 200) : undefined
}

/** Seven days against the seven before: enough to say "more/less than usual" honestly. */
function trendLine(db: DatabaseSync, now: Date): string {
  const from = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  const count = (sql: string, ...params: string[]): number =>
    (db.prepare(sql).get(...params) as { n: number }).n
  const notes = { now: 0, prev: 0 }
  notes.now = count(
    'SELECT COUNT(DISTINCT path) AS n FROM vault_changes WHERE detected_at >= ? AND detected_at < ?',
    from(7),
    from(0),
  )
  notes.prev = count(
    'SELECT COUNT(DISTINCT path) AS n FROM vault_changes WHERE detected_at >= ? AND detected_at < ?',
    from(14),
    from(7),
  )
  const mail = { now: 0, prev: 0 }
  mail.now = count('SELECT COUNT(*) AS n FROM mail_messages WHERE date >= ? AND date < ?', from(7), from(0))
  mail.prev = count(
    'SELECT COUNT(*) AS n FROM mail_messages WHERE date >= ? AND date < ?',
    from(14),
    from(7),
  )
  const events = { now: 0, prev: 0 }
  events.now = count(
    'SELECT COUNT(*) AS n FROM calendar_events WHERE start >= ? AND start < ? AND status != ?',
    from(7),
    from(0),
    'cancelled',
  )
  events.prev = count(
    'SELECT COUNT(*) AS n FROM calendar_events WHERE start >= ? AND start < ? AND status != ?',
    from(14),
    from(7),
    'cancelled',
  )
  return `Last 7 days (previous 7): notes changed ${notes.now} (${notes.prev}), mail ${mail.now} (${mail.prev}), events ${events.now} (${events.prev}).`
}

export async function createBriefing(
  db: DatabaseSync,
  sources: Source[],
  config: Config,
  opts: Options = {},
): Promise<BriefingResult> {
  const now = opts.now ?? new Date()
  if (isLocalOnly(db) || !config.deepseekKey) return rulesBriefing(db, now, opts)

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
        .all(since.toISOString()) as Array<{ path: string; added: number; removed: number }>)
        .filter((change) => !isExcludedVaultPath(db, change.path))
        .map((change, index) => ({
          ...change,
          // Only the five most changed notes carry text: enough substance, bounded privacy.
          ...(index < 5 ? { excerpt: diffExcerpt(db, change.path, since) } : {}),
        }))
    : []

  const tasks = isSourceEnabled(db, 'vault')
    ? (
        db
          .prepare('SELECT path, text, done, tag FROM tasks WHERE last_seen >= ?')
          .all(since.toISOString()) as Array<{
          path: string
          text: string
          done: number
          tag: string | null
        }>
      ).filter((task) => !isExcludedVaultPath(db, task.path))
    : []

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

  const facts = (() => {
    const count = (sql: string, ...params: string[]): number =>
      (db.prepare(sql).get(...params) as { n: number }).n
    // Attention already owns the counts the page prints; facts must not argue with them.
    const mailEnabled = isSourceEnabled(db, 'mail')
    const unread = mailEnabled
      ? attention.find((item) => item.kind === 'mail')?.count ??
        (
          db
            .prepare('SELECT sender FROM mail_messages WHERE seen = 0 AND bulk = 0')
            .all() as Array<{ sender: string }>
        ).filter((row) => !isExcludedSender(db, row.sender)).length
      : 0
    const awaiting = mailEnabled
      ? attention.find((item) => item.kind === 'reply')?.count ?? 0
      : 0
    const notesChanged = new Set(vaultChanges.map((change) => change.path)).size
    const eventsToday = isSourceEnabled(db, 'calendar')
      ? todayEvents(db, now).length
      : 0
    return [
      `Mail unread: ${unread ?? count('SELECT COUNT(*) AS n FROM mail_messages WHERE seen = 0 AND bulk = 0')}`,
      `Mail awaiting a reply: ${awaiting}`,
      `Notes changed since the last briefing: ${notesChanged}`,
      `Drive files changed: ${driveChanges.length}`,
      `Open tasks: ${tasks.filter((task) => task.done === 0).length}`,
      `Events today: ${eventsToday}`,
    ]
  })()

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
    facts,
    trend: trendLine(db, now),
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
    const parsedOutput = parseModelOutput(raw)
    const grounded = groundParsed(parsedOutput, digest, facts)
    const parsed = grounded.parsed
    let body = resolveRefs(parsed, digest.refs)
    let dropped = grounded.dropped
    let verified = false
    let verificationError: string | null = null
    let usageTotal = usage
    if (groundingStrict(db) && body.bullets.length > 0) {
      try {
        const check = await verifyBriefing(
          config.deepseekKey,
          digest.text,
          JSON.stringify(body.bullets.map((bullet, index) => ({ index, text: bullet.text }))),
          { ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}) },
        )
        const unsupported = new Set(check.unsupported)
        const kept = body.bullets.filter((_, index) => !unsupported.has(index))
        dropped += body.bullets.length - kept.length
        body = { ...body, bullets: kept }
        verified = check.ok
        if (check.usage) {
          usageTotal = usageTotal
            ? {
                prompt: usageTotal.prompt + check.usage.prompt,
                completion: usageTotal.completion + check.usage.completion,
              }
            : check.usage
        }
      } catch (error) {
        // The verifier is an extra check, not the briefing: a failed call keeps the draft.
        verificationError = error instanceof Error ? error.message : String(error)
        console.error('[briefing] verification failed:', error)
      }
    }
    // Every point the model offered was unsupported: the deterministic list is the honest answer.
    if (body.bullets.length === 0 && parsedOutput.bullets.length > 0) {
      return rulesBriefing(db, now, opts)
    }
    const markdown = renderMarkdown(body)
    const digestMeta = {
      since: since.toISOString(),
      until: now.toISOString(),
      headline: body.headline,
      // Only remember the suggestion if the model made one, so the next digest stays quiet.
      ...(body.suggestion ? { suggestion: body.suggestion } : {}),
      // Only remember the note if the digest actually carried it, so a busy day costs nothing.
      ...(resurfacedShown && resurface ? { resurface: resurface.path } : {}),
      sources: sources.map((source) => source.id),
      model: 'deepseek-flash',
      grounding: {
        dropped,
        verified,
        ...(verificationError ? { error: verificationError.slice(0, 200) } : {}),
      },
      ...(usageTotal ? { usage: usageTotal } : {}),
      ...(finishReason === 'length' ? { truncated: true } : {}),
    }
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
        JSON.stringify(digestMeta),
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
    return { id: Number(lastInsertRowid), markdown, body, digest: digest.text, digestMeta }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
