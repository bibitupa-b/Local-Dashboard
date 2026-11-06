import type { DatabaseSync } from 'node:sqlite'
import { parseNote } from './sources/vault/parse.js'
import { isExcludedSender, isExcludedVaultPath, isSourceEnabled } from './settings.js'

export type AttentionItem = {
  kind:
    | 'task'
    | 'mail'
    | 'reply'
    | 'browser'
    | 'github'
    | 'calendar'
    | 'stale-project'
    | 'inbox'
    | 'drive'
    | 'google-task'
  label: string
  detail: string
  count?: number
  path?: string
  messageId?: string
  url?: string
  fileId?: string
}

const TEMPLATES = 'Templates/%'

/** The source a queue item belongs to; one map keeps every consumer honest. */
export function sourceForKind(kind: AttentionItem['kind']): string {
  switch (kind) {
    case 'task':
    case 'inbox':
    case 'stale-project':
      return 'vault'
    case 'google-task':
      return 'tasks'
    case 'mail':
    case 'reply':
      return 'mail'
    case 'drive':
      return 'drive'
    case 'calendar':
      return 'calendar'
    case 'browser':
      return 'browser'
    case 'github':
      return 'github'
  }
}

export function visibleAttention(
  db: DatabaseSync,
  now: Date,
  opts: { staleDays: number; inboxDays: number },
): AttentionItem[] {
  return buildAttention(db, now, opts).filter((item) =>
    isSourceEnabled(db, sourceForKind(item.kind)),
  )
}

export function normalizeSubject(subject: string): string {
  let value = subject.trim().toLowerCase()
  while (/^(re|fwd|fw|aw|ответ):/.test(value)) {
    value = value.replace(/^(re|fwd|fw|aw|ответ):\s*/, '')
  }
  return value.replace(/\s+/g, ' ').trim()
}

export function buildAttention(
  db: DatabaseSync,
  now: Date,
  opts: { staleDays: number; inboxDays: number },
): AttentionItem[] {
  const items: AttentionItem[] = []
  const staleBefore = new Date(now.getTime() - opts.staleDays * 86_400_000).toISOString()
  const inboxBefore = new Date(now.getTime() - opts.inboxDays * 86_400_000).toISOString()

  const tasks = (
    db
      .prepare(`SELECT path, text, tag FROM tasks WHERE done = 0 AND path NOT LIKE ?`)
      .all(TEMPLATES) as Array<{ path: string; text: string; tag: string | null }>
  ).filter((task) => !isExcludedVaultPath(db, task.path))

  const groups = new Map<string, { count: number; paths: Set<string> }>()
  const byNote = new Map<string, string[]>()
  for (const task of tasks) {
    if (task.tag) {
      const group = groups.get(task.tag) ?? { count: 0, paths: new Set<string>() }
      group.count++
      group.paths.add(task.path)
      groups.set(task.tag, group)
    } else {
      const list = byNote.get(task.path) ?? []
      list.push(task.text)
      byNote.set(task.path, list)
    }
  }
  for (const [path, texts] of byNote) {
    items.push({
      kind: 'task',
      label: texts[0]!,
      detail: texts.length === 1 ? path : `${texts.length - 1} more in ${path}`,
      count: texts.length,
      path,
    })
  }
  for (const [tag, group] of groups) {
    const path = [...group.paths][0]
    items.push({
      kind: 'task',
      label: `#${tag}`,
      detail: `${group.count} open in ${group.paths.size} note${group.paths.size === 1 ? '' : 's'}`,
      count: group.count,
      path,
    })
  }

  const today = now.toLocaleDateString('en-CA')
  const googleTasks = db
    .prepare(
      `SELECT id, title, due FROM google_tasks
       WHERE due IS NOT NULL AND due <= ? ORDER BY due ASC LIMIT 10`,
    )
    .all(today) as Array<{ id: string; title: string; due: string }>
  for (const task of googleTasks) {
    items.push({
      kind: 'google-task',
      label: task.title,
      detail: `Google Tasks · due ${task.due}`,
    })
  }

  const replyCutoff = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const replyWindow = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const candidates = db
    .prepare(
      `SELECT sender, subject, date, thread_key FROM mail_messages
       WHERE folder = 'INBOX' AND bulk = 0 AND date <= ? AND date >= ?
       ORDER BY date ASC`,
    )
    .all(replyCutoff, replyWindow) as Array<{
    sender: string
    subject: string
    date: string
    thread_key: string | null
  }>

  const sent = db
    .prepare(
      `SELECT subject, date, thread_key FROM mail_messages WHERE folder LIKE '%Sent%' AND date >= ?`,
    )
    .all(replyWindow) as Array<{ subject: string; date: string; thread_key: string | null }>
  const repliedThreads = new Map<string, number>()
  const repliedSubjects = new Map<string, number>()
  for (const message of sent) {
    const at = Date.parse(message.date)
    const thread = message.thread_key?.trim().toLowerCase()
    if (thread) repliedThreads.set(thread, Math.max(repliedThreads.get(thread) ?? 0, at))
    const key = normalizeSubject(message.subject)
    repliedSubjects.set(key, Math.max(repliedSubjects.get(key) ?? 0, at))
  }

  const repliedAt = (message: { thread_key: string | null; subject: string }): number => {
    const thread = message.thread_key?.trim().toLowerCase()
    return (
      (thread ? repliedThreads.get(thread) : undefined) ??
      repliedSubjects.get(normalizeSubject(message.subject)) ??
      0
    )
  }

  const waiting = candidates.filter(
    (message) =>
      !isExcludedSender(db, message.sender) &&
      !(repliedAt(message) > Date.parse(message.date)),
  )
  if (waiting.length > 0) {
    items.push({
      kind: 'reply',
      label: `${waiting.length} awaiting your reply`,
      detail: waiting
        .slice(0, 3)
        .map((message) => message.sender.split('<')[0]!.trim() || message.sender)
        .join(', '),
      count: waiting.length,
    })
  }

  const github = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(kind = 'review'), 0) AS reviews,
              COUNT(DISTINCT repo) AS repos,
              (SELECT url FROM github_items ORDER BY updated_at DESC LIMIT 1) AS url FROM github_items`,
    )
    .get() as { total: number; reviews: number; repos: number; url: string | null }
  if (github.total > 0) {
    items.push({
      kind: 'github',
      label: `GitHub: ${github.total} items`,
      detail: `${github.reviews} review requests · ${github.repos} repos`,
      count: github.total,
      ...(github.url ? { url: github.url } : {}),
    })
  }

  const nextEvent = db
    .prepare(
      `SELECT summary, start FROM calendar_events
       WHERE start >= ? AND status != 'cancelled' ORDER BY start LIMIT 1`,
    )
    .get(now.toISOString()) as { summary: string; start: string } | undefined
  if (nextEvent) {
    items.push({
      kind: 'calendar',
      label: nextEvent.summary,
      detail: `Next at ${new Date(nextEvent.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    })
  }

  const mailWindow = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const mailRows = db
    .prepare(
      `SELECT sender, starred, message_id, COALESCE(message_id, folder || ':' || uid) AS key
       FROM mail_messages
       WHERE folder IN ('INBOX', '[Gmail]/Important') AND seen = 0 AND bulk = 0 AND date >= ?
       ORDER BY date DESC`,
    )
    .all(mailWindow) as Array<{
    sender: string
    starred: number
    message_id: string | null
    key: string
  }>

  const seenKeys = new Set<string>()
  const senders = new Map<string, number>()
  let unread = 0
  let starred = 0
  let messageId: string | null = null
  for (const row of mailRows) {
    if (seenKeys.has(row.key)) continue
    seenKeys.add(row.key)
    if (isExcludedSender(db, row.sender)) continue
    unread++
    if (!messageId && row.message_id) messageId = row.message_id
    senders.set(row.sender, (senders.get(row.sender) ?? 0) + 1)
    if (row.starred === 1) starred++
  }

  if (unread > 0) {
    const top = [...senders].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sender]) => sender)
    items.push({
      kind: 'mail',
      label: `Mail: ${unread} unread`,
      detail: [starred > 0 ? `${starred} starred` : '', top.join(', ')].filter(Boolean).join(' · '),
      count: unread,
      ...(messageId ? { messageId } : {}),
    })
  }

  const projectNotes = (
    db
      .prepare(`SELECT path, previous_text AS text FROM vault_files
        WHERE mtime <= ? AND previous_text LIKE '%status%'`)
      .all(staleBefore) as Array<{ path: string; text: string }>
  ).filter((note) => !isExcludedVaultPath(db, note.path))
  for (const note of projectNotes) {
    const status = parseNote(note.text).frontmatter.status
    if (typeof status !== 'string' || !status.toLowerCase().includes('undone')) continue
    items.push({
      kind: 'stale-project',
      label: note.path.split('/').pop()!.replace(/\.md$/, ''),
      detail: `Undone, untouched for ${opts.staleDays}+ days`,
      path: note.path,
    })
  }

  const inbox = (
    db
      .prepare(
        `SELECT path, mtime FROM vault_files WHERE path LIKE 'Inbox/%' AND mtime <= ?
         ORDER BY mtime ASC`,
      )
      .all(inboxBefore) as Array<{ path: string; mtime: string }>
  ).filter((note) => !isExcludedVaultPath(db, note.path))
  for (const note of inbox) {
    const days = Math.floor((now.getTime() - Date.parse(note.mtime)) / 86_400_000)
    items.push({
      kind: 'inbox',
      label: note.path.split('/').pop()!.replace(/\.md$/, ''),
      detail: `In Inbox for ${days} days`,
      path: note.path,
    })
  }

  const order = {
    task: 0,
    'google-task': 0,
    mail: 1,
    reply: 2,
    browser: 3,
    github: 4,
    calendar: 5,
    'stale-project': 6,
    inbox: 7,
    drive: 8,
  } as const
  return items.sort((a, b) => order[a.kind] - order[b.kind] || (b.count ?? 1) - (a.count ?? 1))
}

/** What happened, not what needs a decision: browser and Drive belong here. */
export function buildActivity(db: DatabaseSync, now: Date): AttentionItem[] {
  const items: AttentionItem[] = []
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const browsing = db
    .prepare(
      `SELECT domain, COUNT(*) AS n FROM browser_visits
       WHERE visited_at >= ? GROUP BY domain ORDER BY n DESC LIMIT 3`,
    )
    .all(todayStart) as Array<{ domain: string; n: number }>
  // Every visit, not the three domains named below: the label says "today", so the number must mean today.
  const visits = (
    db
      .prepare('SELECT COUNT(*) AS n FROM browser_visits WHERE visited_at >= ?')
      .get(todayStart) as { n: number }
  ).n
  if (visits > 0) {
    items.push({
      kind: 'browser',
      label: `Browser: ${visits} visits today`,
      detail: browsing.map((row) => `${row.domain} (${row.n})`).join(', '),
      count: visits,
    })
  }

  const drive = db
    .prepare(
      `SELECT c.kind, c.file_id AS fileId, COALESCE(f.name, c.file_id) AS name FROM drive_changes c
       LEFT JOIN drive_files f ON f.connection_id = c.connection_id AND f.id = c.file_id
       WHERE c.detected_at >= ? ORDER BY c.detected_at DESC LIMIT 10`,
    )
    .all(new Date(now.getTime() - 7 * 86_400_000).toISOString()) as Array<{
    kind: string
    fileId: string
    name: string
  }>
  for (const change of drive) {
    items.push({
      kind: 'drive',
      label: change.name,
      detail: `Drive: ${change.kind}`,
      fileId: change.fileId,
    })
  }
  return items
}

export function visibleActivity(db: DatabaseSync, now: Date): AttentionItem[] {
  return buildActivity(db, now).filter((item) =>
    isSourceEnabled(db, sourceForKind(item.kind)),
  )
}
