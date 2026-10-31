import type { DatabaseSync } from 'node:sqlite'
import { parseNote } from './sources/vault/parse.js'
import { isExcludedSender } from './settings.js'

export type AttentionItem = {
  kind: 'task' | 'mail' | 'reply' | 'calendar' | 'stale-project' | 'inbox' | 'drive'
  label: string
  detail: string
  count?: number
  path?: string
}

const TEMPLATES = 'Templates/%'

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

  const tasks = db
    .prepare(`SELECT path, text, tag FROM tasks WHERE done = 0 AND path NOT LIKE ?`)
    .all(TEMPLATES) as Array<{ path: string; text: string; tag: string | null }>

  const groups = new Map<string, { count: number; paths: Set<string> }>()
  for (const task of tasks) {
    if (task.tag) {
      const group = groups.get(task.tag) ?? { count: 0, paths: new Set<string>() }
      group.count++
      group.paths.add(task.path)
      groups.set(task.tag, group)
    } else {
      items.push({ kind: 'task', label: task.text, detail: task.path, count: 1, path: task.path })
    }
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

  const replyCutoff = new Date(now.getTime() - 24 * 3_600_000).toISOString()
  const replyWindow = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const candidates = db
    .prepare(
      `SELECT sender, subject, date FROM mail_messages
       WHERE folder = 'INBOX' AND seen = 0 AND bulk = 0 AND date <= ? AND date >= ?
       ORDER BY date ASC`,
    )
    .all(replyCutoff, replyWindow) as Array<{ sender: string; subject: string; date: string }>

  const sent = db
    .prepare(
      `SELECT subject, date FROM mail_messages WHERE folder LIKE '%Sent%' AND date >= ?`,
    )
    .all(replyWindow) as Array<{ subject: string; date: string }>
  const repliedAt = new Map<string, number>()
  for (const message of sent) {
    const key = normalizeSubject(message.subject)
    repliedAt.set(key, Math.max(repliedAt.get(key) ?? 0, Date.parse(message.date)))
  }

  const waiting = candidates.filter(
    (message) =>
      !isExcludedSender(db, message.sender) &&
      !((repliedAt.get(normalizeSubject(message.subject)) ?? 0) > Date.parse(message.date)),
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
      detail: `Next at ${new Date(nextEvent.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    })
  }

  const mailWindow = new Date(now.getTime() - 30 * 86_400_000).toISOString()
  const mailRows = db
    .prepare(
      `SELECT sender, starred, COALESCE(message_id, folder || ':' || uid) AS key
       FROM mail_messages
       WHERE folder IN ('INBOX', '[Gmail]/Important') AND seen = 0 AND bulk = 0 AND date >= ?`,
    )
    .all(mailWindow) as Array<{ sender: string; starred: number; key: string }>

  const seenKeys = new Set<string>()
  const senders = new Map<string, number>()
  let unread = 0
  let starred = 0
  for (const row of mailRows) {
    if (seenKeys.has(row.key)) continue
    seenKeys.add(row.key)
    if (isExcludedSender(db, row.sender)) continue
    unread++
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
    })
  }

  const projectNotes = db
    .prepare(`SELECT path, previous_text AS text FROM vault_files WHERE mtime <= ?`)
    .all(staleBefore) as Array<{ path: string; text: string }>
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

  const inbox = db
    .prepare(
      `SELECT path, mtime FROM vault_files WHERE path LIKE 'Inbox/%' AND mtime <= ?
       ORDER BY mtime ASC`,
    )
    .all(inboxBefore) as Array<{ path: string; mtime: string }>
  for (const note of inbox) {
    const days = Math.floor((now.getTime() - Date.parse(note.mtime)) / 86_400_000)
    items.push({
      kind: 'inbox',
      label: note.path.split('/').pop()!.replace(/\.md$/, ''),
      detail: `In Inbox for ${days} days`,
      path: note.path,
    })
  }

  const drive = db
    .prepare(
      `SELECT c.kind, COALESCE(f.name, c.file_id) AS name FROM drive_changes c
       LEFT JOIN drive_files f ON f.id = c.file_id
       WHERE c.detected_at >= ? ORDER BY c.detected_at DESC LIMIT 10`,
    )
    .all(new Date(now.getTime() - 7 * 86_400_000).toISOString()) as Array<{ kind: string; name: string }>
  for (const change of drive) {
    items.push({ kind: 'drive', label: change.name, detail: `Drive: ${change.kind}` })
  }

  const order = { task: 0, mail: 1, reply: 2, calendar: 3, 'stale-project': 4, inbox: 5, drive: 6 } as const
  return items.sort((a, b) => order[a.kind] - order[b.kind] || (b.count ?? 1) - (a.count ?? 1))
}
