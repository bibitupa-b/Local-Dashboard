import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { createMailSource, type MailApi, type MailMessage } from '../src/server/sources/mail.js'

function message(uid: number, overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    folder: 'INBOX',
    uid,
    messageId: `<${uid}@mail>`,
    sender: 'Alice <alice@example.com>',
    subject: `Subject ${uid}`,
    date: new Date().toISOString(),
    seen: false,
    starred: false,
    snippet: `snippet ${uid}`,
    body: `body ${uid}`,
    attachments: [],
    ...overrides,
  }
}

function fakeApi() {
  const state = {
    folders: [{ path: 'INBOX' }, { path: '[Gmail]/All Mail' }],
    uidValidity: '1',
    messages: [] as MailMessage[],
    calls: [] as Array<{ folder: string; fromUid: number }>,
  }
  const api: MailApi = {
    folders: async () => state.folders,
    syncFolder: async (folder, fromUid) => {
      state.calls.push({ folder, fromUid })
      const fresh = state.messages.filter((item) => item.folder === folder && item.uid > fromUid)
      return {
        messages: fresh,
        uidValidity: state.uidValidity,
        flags: state.messages
          .filter((item) => item.folder === folder)
          .map((item) => ({ uid: item.uid, seen: item.seen, starred: item.starred })),
      }
    },
  }
  return { api, state }
}

test('syncs incrementally, skips All Mail and records the cursor', async () => {
  const db = openDb(':memory:')
  const { api, state } = fakeApi()
  state.messages.push(message(1), message(2))
  const source = createMailSource(api)

  await source.sync(db)
  expect(state.calls.map((call) => call.folder)).toEqual(['INBOX'])
  expect(db.prepare('SELECT COUNT(*) AS n FROM mail_messages').get()).toEqual({ n: 2 })
  expect(db.prepare("SELECT last_uid FROM mail_folders WHERE path = 'INBOX'").get()).toEqual({ last_uid: 2 })

  await source.sync(db)
  expect(state.calls.at(-1)).toEqual({ folder: 'INBOX', fromUid: 2 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM mail_messages').get()).toEqual({ n: 2 })

  state.messages.push(message(3))
  await source.sync(db)
  expect(db.prepare('SELECT COUNT(*) AS n FROM mail_messages').get()).toEqual({ n: 3 })
})

test('flag changes on existing messages are applied', async () => {
  const db = openDb(':memory:')
  const { api, state } = fakeApi()
  state.messages.push(message(1))
  const source = createMailSource(api)
  await source.sync(db)

  state.messages[0]!.seen = true
  state.messages[0]!.starred = true
  await source.sync(db)

  expect(db.prepare('SELECT seen, starred FROM mail_messages WHERE uid = 1').get()).toEqual({
    seen: 1,
    starred: 1,
  })
})

test('a changed UIDVALIDITY wipes the folder and refetches from zero', async () => {
  const db = openDb(':memory:')
  const { api, state } = fakeApi()
  state.messages.push(message(1), message(2))
  const source = createMailSource(api)
  await source.sync(db)

  state.uidValidity = '2'
  state.messages = [message(10)]
  await source.sync(db)

  expect(state.calls.at(-1)).toEqual({ folder: 'INBOX', fromUid: 0 })
  expect(db.prepare('SELECT uid FROM mail_messages ORDER BY uid').all()).toEqual([{ uid: 10 }])
  // UIDs restart from 1 after renumbering, so the cursor must follow them down.
  expect(db.prepare("SELECT last_uid, uid_validity FROM mail_folders WHERE path = 'INBOX'").get()).toEqual({
    last_uid: 10,
    uid_validity: '2',
  })
})

test('bodies older than 90 days are dropped', async () => {
  const db = openDb(':memory:')
  const { api, state } = fakeApi()
  state.messages.push(message(1, { date: new Date(Date.now() - 120 * 86_400_000).toISOString() }))
  const source = createMailSource(api)
  await source.sync(db)
  expect(db.prepare('SELECT body FROM mail_messages WHERE uid = 1').get()).toEqual({ body: null })
})

test('a failed folder never advances its cursor but does not stop the others', async () => {
  const db = openDb(':memory:')
  const failing: MailApi = {
    folders: async () => [{ path: 'INBOX' }],
    syncFolder: async () => {
      throw new Error('imap down')
    },
  }
  await expect(createMailSource(failing).sync(db)).resolves.toBeUndefined()
  expect(db.prepare('SELECT COUNT(*) AS n FROM mail_folders').get()).toEqual({ n: 0 })
})

test('digest lists unread subjects and counts', async () => {
  const db = openDb(':memory:')
  const insert = db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 0, ?, NULL, '[]')`,
  )
  insert.run('INBOX', 1, 'Alice <a@x.com>', 'Quarterly plan', new Date().toISOString(), 0, 'numbers attached')
  insert.run('INBOX', 2, 'Bob <b@x.com>', 'Already read', new Date().toISOString(), 1, '')
  insert.run('[Gmail]/Spam', 3, 'Spam <s@x.com>', 'Win money', new Date().toISOString(), 0, 'spam')

  const lines = createMailSource({ folders: async () => [], syncFolder: async () => ({ messages: [], uidValidity: '1', flags: [] }) }).digest(db, new Date())
  const text = lines.join('\n')
  expect(text).toContain('Unread mail: 1')
  expect(text).toContain('Quarterly plan')
  expect(text).not.toContain('Already read')
  expect(text).not.toContain('Win money')
})

test('the same message in INBOX and Important counts once', () => {
  const db = openDb(':memory:')
  const insert = db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments)
     VALUES (?, ?, '<dup@x>', 'Alice <a@x.com>', 'Duplicate', ?, 0, 0, '', NULL, '[]')`,
  )
  const fresh = new Date().toISOString()
  insert.run('INBOX', 1, fresh)
  insert.run('[Gmail]/Important', 7, fresh)

  const lines = createMailSource({ folders: async () => [], syncFolder: async () => ({ messages: [], uidValidity: '1', flags: [] }) }).digest(db, new Date())
  expect(lines.join('\n')).toContain('Unread mail: 1')
})
