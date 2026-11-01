import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { sourceMeta } from '../src/server/sources/types.js'
import { createMailSource, type MailMessage } from '../src/server/sources/mail.js'
import { createCalendarSource, type CalendarEvent } from '../src/server/sources/calendar.js'
import { createGithubSource, type GithubItem } from '../src/server/sources/github.js'
import { createVaultSource } from '../src/server/sources/vault/index.js'

function mailApi(sender: string, folder = 'INBOX') {
  const message: MailMessage = {
    folder,
    uid: 1,
    messageId: null,
    sender,
    subject: 'Hello',
    date: '2026-11-01T10:00:00.000Z',
    seen: false,
    starred: false,
    snippet: '',
    body: 'hi',
    attachments: [],
  }
  return {
    folders: async () => [{ path: folder }],
    syncFolder: async () => ({ messages: [message], uidValidity: '1', flags: [] }),
  }
}

test('two mail accounts keep the same folder and uid separate', async () => {
  const db = openDb(':memory:')
  await createMailSource(mailApi('a@x.com'), sourceMeta('mail', 'imap', 'imap-a', 'A')).sync(db)
  await createMailSource(mailApi('b@x.com'), sourceMeta('mail', 'imap', 'imap-b', 'B')).sync(db)

  const rows = db.prepare('SELECT connection_id, sender FROM mail_messages ORDER BY sender').all()
  expect(rows).toEqual([
    { connection_id: 'imap-a', sender: 'a@x.com' },
    { connection_id: 'imap-b', sender: 'b@x.com' },
  ])
})

test('syncing one calendar does not delete another account events', async () => {
  const db = openDb(':memory:')
  const event = (summary: string): CalendarEvent => ({
    id: 'shared-event-id',
    calendarId: 'primary',
    summary,
    start: '2026-11-01T12:00:00.000Z',
    end: '2026-11-01T13:00:00.000Z',
    location: null,
    status: 'confirmed',
  })

  await createCalendarSource(
    { upcoming: async () => [event('A')] },
    sourceMeta('calendar', 'google', 'google-a'),
  ).sync(db)
  await createCalendarSource(
    { upcoming: async () => [event('B')] },
    sourceMeta('calendar', 'google', 'google-b'),
  ).sync(db)

  expect(db.prepare('SELECT summary FROM calendar_events ORDER BY summary').all()).toEqual([
    { summary: 'A' },
    { summary: 'B' },
  ])
})

test('two GitHub accounts do not wipe each other', async () => {
  const db = openDb(':memory:')
  const item = (title: string): GithubItem => ({
    id: 'shared-id',
    kind: 'notification',
    repo: 'r/r',
    title,
    url: '',
    updatedAt: '2026-11-01T10:00:00.000Z',
  })

  await createGithubSource(
    { items: async () => [item('first')] },
    sourceMeta('github', 'github', 'gh-a'),
  ).sync(db)
  await createGithubSource(
    { items: async () => [item('second')] },
    sourceMeta('github', 'github', 'gh-b'),
  ).sync(db)

  expect(db.prepare('SELECT connection_id, title FROM github_items ORDER BY connection_id').all()).toEqual([
    { connection_id: 'gh-a', title: 'first' },
    { connection_id: 'gh-b', title: 'second' },
  ])
})

test('two vaults with the same relative path stay separate', async () => {
  const first = mkdtempSync(join(tmpdir(), 'vault-a-'))
  const second = mkdtempSync(join(tmpdir(), 'vault-b-'))
  try {
    writeFileSync(join(first, 'Note.md'), '# First vault')
    writeFileSync(join(second, 'Note.md'), '# Second vault')

    const db = openDb(':memory:')
    await createVaultSource(first, sourceMeta('vault', 'vault', 'vault-a')).sync(db)
    await createVaultSource(second, sourceMeta('vault', 'vault', 'vault-b')).sync(db)

    const rows = db
      .prepare('SELECT connection_id, previous_text FROM vault_files ORDER BY connection_id')
      .all()
    expect(rows).toEqual([
      { connection_id: 'vault-a', previous_text: '# First vault' },
      { connection_id: 'vault-b', previous_text: '# Second vault' },
    ])
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks').get()).toEqual({ n: 0 })
  } finally {
    rmSync(first, { recursive: true, force: true })
    rmSync(second, { recursive: true, force: true })
  }
})
