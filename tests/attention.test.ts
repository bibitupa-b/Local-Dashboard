import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import type { DatabaseSync } from 'node:sqlite'

const NOW = new Date('2026-10-31T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

function note(db: DatabaseSync, path: string, text: string, days: number): void {
  db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES (?, ?, ?, ?, ?)`,
  ).run(path, path, daysAgo(days), text.length, text)
}

function task(db: DatabaseSync, path: string, text: string, tag: string | null, done = 0): void {
  db.prepare(
    `INSERT INTO tasks (path, text, tag, done, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(path, text, tag, done, daysAgo(5), daysAgo(1))
}

test('groups recurring tags and hides done, template and fresh items', () => {
  const db = openDb(':memory:')

  for (let i = 0; i < 5; i++) task(db, '02 Areas/💪 Body and Health/day.md', `#vitamins item ${i}`, 'vitamins')
  task(db, 'Inbox/Idea.md', '#vitamins already done', 'vitamins', 1)
  task(db, 'Templates/Template.md', 'template checklist item', null)

  note(db, '01 Projects/Old.md', '---\nstatus: Undone\n---\n', 20)
  note(db, '01 Projects/Fresh.md', '---\nstatus: Undone\n---\n', 1)
  note(db, 'Inbox/Stale.md', 'no frontmatter', 4)
  note(db, 'Inbox/Fresh.md', 'no frontmatter', 1)

  const items = buildAttention(db, NOW, { staleDays: 14, inboxDays: 3 })

  const vitamins = items.filter((item) => item.label === '#vitamins')
  expect(vitamins).toHaveLength(1)
  expect(vitamins[0]!.count).toBe(5)

  expect(items.some((item) => item.label.includes('template checklist'))).toBe(false)
  expect(items.some((item) => item.path === 'Templates/Template.md')).toBe(false)
  expect(items.some((item) => item.path === '01 Projects/Old.md' && item.kind === 'stale-project')).toBe(true)
  expect(items.some((item) => item.path === '01 Projects/Fresh.md')).toBe(false)
  expect(items.some((item) => item.path === 'Inbox/Stale.md' && item.kind === 'inbox')).toBe(true)
  expect(items.some((item) => item.path === 'Inbox/Fresh.md')).toBe(false)
})

test('mail and calendar surface as attention items', () => {
  const db = openDb(':memory:')
  const insert = db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments)
     VALUES ('INBOX', ?, NULL, ?, ?, ?, ?, ?, '', NULL, '[]')`,
  )
  const fresh = new Date(NOW.getTime() - 3_600_000).toISOString()
  insert.run(1, 'Alice <a@x.com>', 'One', fresh, 0, 0)
  insert.run(2, 'Alice <a@x.com>', 'Two', fresh, 0, 1)
  insert.run(3, 'Bob <b@x.com>', 'Three', fresh, 0, 0)
  insert.run(4, 'Spam <s@x.com>', 'Spam', fresh, 0, 0)

  const start = new Date(NOW.getTime() + 3_600_000).toISOString()
  const end = new Date(NOW.getTime() + 7_200_000).toISOString()
  db.prepare(
    `INSERT INTO calendar_events (id, calendar_id, summary, start, end, location, status)
     VALUES ('e1', 'primary', 'Standup', ?, ?, NULL, 'confirmed')`,
  ).run(start, end)

  const items = buildAttention(db, NOW, { staleDays: 14, inboxDays: 3 })
  const mail = items.find((item) => item.kind === 'mail')
  expect(mail?.count).toBe(4)
  expect(mail?.detail).toContain('Alice')
  expect(items.find((item) => item.kind === 'calendar')?.label).toBe('Standup')
  expect(items.findIndex((item) => item.kind === 'mail')).toBeLessThan(
    items.findIndex((item) => item.kind === 'calendar'),
  )
})

test('bulk mail and excluded senders do not count as unread', async () => {
  const db = openDb(':memory:')
  const { setList, LIST_KEYS } = await import('../src/server/settings.js')
  setList(db, LIST_KEYS.mailSenders, ['noreply'])

  const insert = db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments, bulk)
     VALUES ('INBOX', ?, NULL, ?, ?, ?, 0, 0, '', NULL, '[]', ?)`,
  )
  const fresh = new Date(NOW.getTime() - 3_600_000).toISOString()
  insert.run(1, 'Alice <a@x.com>', 'Real', fresh, 0)
  insert.run(2, 'Shop <shop@x.com>', 'Newsletter', fresh, 1)
  insert.run(3, 'NoReply <noreply@x.com>', 'Receipt', fresh, 0)

  const items = buildAttention(db, NOW, { staleDays: 14, inboxDays: 3 })
  expect(items.find((item) => item.kind === 'mail')?.count).toBe(1)
})

test('only old, unreplied personal mail counts as awaiting a reply', async () => {
  const db = openDb(':memory:')
  const insert = db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments, bulk)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 0, '', NULL, '[]', ?)`,
  )
  const old = new Date(NOW.getTime() - 3 * 86_400_000).toISOString()
  const older = new Date(NOW.getTime() - 5 * 86_400_000).toISOString()
  const recent = new Date(NOW.getTime() - 3_600_000).toISOString()

  insert.run('INBOX', 1, 'Alice <a@x.com>', 'Project plan', old, 0, 0)
  insert.run('INBOX', 2, 'Bob <b@x.com>', 'Invoice question', older, 0, 0)
  insert.run('[Gmail]/Sent Mail', 3, 'Me <me@x.com>', 'Re: Invoice question', old, 1, 0)
  insert.run('INBOX', 4, 'Shop <s@x.com>', 'Sale', old, 0, 1)
  insert.run('INBOX', 5, 'Carol <c@x.com>', 'Fresh ping', recent, 0, 0)

  const items = buildAttention(db, NOW, { staleDays: 14, inboxDays: 3 })
  const reply = items.find((item) => item.kind === 'reply')
  expect(reply?.count).toBe(1)
  expect(reply?.detail).toContain('Alice')
})

test('excluded vault folders disappear from the attention queue', async () => {
  const db = openDb(':memory:')
  const { setList, LIST_KEYS } = await import('../src/server/settings.js')
  setList(db, LIST_KEYS.vaultPrefixes, ['02 areas/💪 body and health'])

  task(db, '02 Areas/💪 Body and Health/day.md', '#vitamins Zinc', 'vitamins')
  task(db, '01 Projects/Live.md', 'keep me', null)
  note(db, '02 Areas/💪 Body and Health/Old.md', '---\nstatus: Undone\n---\n', 30)

  const items = buildAttention(db, NOW, { staleDays: 14, inboxDays: 3 })
  expect(items.some((item) => item.label === '#vitamins')).toBe(false)
  expect(items.some((item) => item.path?.includes('Body and Health'))).toBe(false)
  expect(items.some((item) => item.label === 'keep me')).toBe(true)
})

test('untagged tasks appear once and the first item is the loudest group', () => {
  const db = openDb(':memory:')
  task(db, 'Inbox/Idea.md', 'single task', null)
  db.prepare('INSERT INTO drive_changes (file_id, kind, detected_at) VALUES (?, ?, ?)').run('f1', 'added', daysAgo(0))

  const items = buildAttention(db, NOW, { staleDays: 14, inboxDays: 3 })
  expect(items.filter((item) => item.kind === 'task')).toHaveLength(1)
  expect(items.some((item) => item.kind === 'drive')).toBe(true)
  expect(items[0]!.kind).toBe('task')
})
