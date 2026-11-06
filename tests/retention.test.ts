import { expect, test } from 'vitest'
import { openDb, setSetting } from '../src/server/db/index.js'
import { applyRetention } from '../src/server/retention.js'

const NOW = new Date('2026-11-06T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

test('retention drops old mail bodies, browser visits and vault changes', () => {
  const db = openDb(':memory:')
  setSetting(db, 'mail_body_days', '30')
  setSetting(db, 'browser_days', '30')
  setSetting(db, 'vault_change_days', '30')

  const mail = db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments, bulk)
     VALUES ('INBOX', ?, NULL, 'Alice <a@x.com>', ?, ?, 0, 0, 'old snippet', 'old body', '[]', 0)`,
  )
  mail.run(1, 'Old', daysAgo(40))
  mail.run(2, 'Fresh', daysAgo(2))

  db.prepare(
    `INSERT INTO browser_visits (url, domain, title, visited_at) VALUES (?, ?, '', ?)`,
  ).run('https://old.test', 'old.test', daysAgo(40))
  db.prepare(
    `INSERT INTO browser_visits (url, domain, title, visited_at) VALUES (?, ?, '', ?)`,
  ).run('https://fresh.test', 'fresh.test', daysAgo(2))

  db.prepare(
    `INSERT INTO vault_changes (path, detected_at, added, removed) VALUES (?, ?, 1, 0)`,
  ).run('Old.md', daysAgo(40))
  db.prepare(
    `INSERT INTO vault_changes (path, detected_at, added, removed) VALUES (?, ?, 1, 0)`,
  ).run('Fresh.md', daysAgo(2))

  applyRetention(db, NOW)

  expect(db.prepare('SELECT uid, body, snippet FROM mail_messages ORDER BY uid').all()).toEqual([
    { uid: 1, body: null, snippet: '' },
    { uid: 2, body: 'old body', snippet: 'old snippet' },
  ])
  expect(db.prepare('SELECT domain FROM browser_visits').all()).toEqual([{ domain: 'fresh.test' }])
  expect(db.prepare('SELECT path FROM vault_changes').all()).toEqual([{ path: 'Fresh.md' }])
})
