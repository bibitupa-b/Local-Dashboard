import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import { purgeConnectionData } from '../src/server/connections.js'
import {
  createMicrosoftTeamsApi,
  createTeamsSource,
  type TeamsApi,
  type TeamsMention,
} from '../src/server/sources/teams.js'
import { toMicrosoftEvents } from '../src/server/sources/microsoft-calendar.js'
import { createCalendarSource } from '../src/server/sources/calendar.js'
import { sourceMeta } from '../src/server/sources/types.js'
import type { MicrosoftCreds } from '../src/server/microsoft.js'

function fakeApi(mentions: TeamsMention[]): TeamsApi {
  return { async mentions() { return mentions } }
}

const twoMentions: TeamsMention[] = [
  { chatId: 'c1', chatName: 'Design', messageId: 'm1', fromId: 'u1', createdAt: new Date().toISOString(), isMention: true },
  { chatId: 'c1', chatName: 'Design', messageId: 'm2', fromId: 'u2', createdAt: new Date().toISOString(), isMention: true },
]

test('stores Teams mentions and never stores message text', async () => {
  const db = openDb(':memory:')
  const source = createTeamsSource(fakeApi([{ chatId: 'c1', chatName: 'Design', messageId: 'm1', fromId: 'u1', createdAt: new Date().toISOString(), isMention: true }]))
  await source.sync(db)
  const row = db.prepare('SELECT * FROM teams_mentions').get() as Record<string, unknown>
  expect(row.chat_name).toBe('Design')
  expect(Object.keys(row)).not.toContain('text')
  expect(source.digest(db, new Date()).join('\n')).toContain('Teams: 1 mention in 1 chat')
})

test('Teams attention is one counted item, not a list of messages', async () => {
  const db = openDb(':memory:')
  const source = createTeamsSource(fakeApi([...twoMentions]))
  await source.sync(db)
  const item = buildAttention(db, new Date(), { staleDays: 14, inboxDays: 3 }).find((entry) => entry.kind === 'teams')
  expect(item?.count).toBe(2)
  expect(item?.detail).toContain('Design')
})

test('maps Graph calendar events into CalendarEvent', () => {
  const events = toMicrosoftEvents([{ id: 'e1', subject: 'Review', start: { dateTime: '2026-11-07T10:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-11-07T11:00:00', timeZone: 'UTC' }, location: { displayName: 'Room' }, isCancelled: false }])
  expect(events[0]).toMatchObject({ id: 'e1', summary: 'Review', location: 'Room', status: 'confirmed' })
})

test('maps a non-UTC offset to one UTC instant and marks cancelled events', () => {
  const events = toMicrosoftEvents([
    { id: 'e1', subject: 'Standup', start: { dateTime: '2026-11-07T10:00:00', timeZone: 'Asia/Kolkata' }, end: { dateTime: '2026-11-07T10:30:00', timeZone: 'Asia/Kolkata' } },
    { id: 'e2', subject: 'Gone', start: { dateTime: '2026-11-07T10:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-11-07T11:00:00', timeZone: 'UTC' }, isCancelled: true },
  ])
  expect(events[0]?.start).toBe('2026-11-07T04:30:00.000Z')
  expect(events[1]?.status).toBe('cancelled')
})

test('selects one-to-one vs group mentions and requests no message body', async () => {
  const now = new Date().toISOString()
  const seen: string[] = []
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    seen.push(url)
    if (url.includes('/me/chats?')) {
      return new Response(JSON.stringify({
        value: [
          { id: 'c1', chatType: 'oneOnOne', topic: null, members: [{ userId: 'me' }, { userId: 'u2', displayName: 'Alice' }] },
          { id: 'c2', chatType: 'group', topic: 'Design', members: [{ userId: 'me' }, { userId: 'u3', displayName: 'Bob' }] },
        ],
      }), { status: 200 })
    }
    if (url.includes('/me/chats/c1/messages')) {
      return new Response(JSON.stringify({
        value: [
          { id: 'm1', createdDateTime: now, from: { user: { id: 'me' } } },
          { id: 'm2', createdDateTime: now, from: { user: { id: 'u2' } } },
        ],
      }), { status: 200 })
    }
    if (url.includes('/me/chats/c2/messages')) {
      return new Response(JSON.stringify({
        value: [
          { id: 'm3', createdDateTime: now, from: { user: { id: 'u3' } }, mentions: [{ mentioned: { user: { id: 'me' } } }] },
          { id: 'm4', createdDateTime: now, from: { user: { id: 'u3' } }, mentions: [{ mentioned: { user: { id: 'u4' } } }] },
        ],
      }), { status: 200 })
    }
    throw new Error('unexpected url ' + url)
  }

  const creds: MicrosoftCreds = {
    clientId: 'client',
    port: 4317,
    tokens: { access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 3_600_000, scope: 'Calendars.Read Chat.Read' },
    fetcher,
  }
  const api = createMicrosoftTeamsApi(creds, 'me')
  const mentions = await api!.mentions()

  expect(mentions.map((m) => m.chatName)).toEqual(['Alice', 'Design'])
  expect(mentions.map((m) => m.fromId)).toEqual(['u2', 'u3'])

  const messageUrls = seen.filter((u) => u.includes('/messages'))
  expect(messageUrls).toHaveLength(2)
  for (const url of messageUrls) {
    expect(url).toContain('$select=id,createdDateTime,from,mentions')
    expect(url).not.toContain('body')
  }
})

test('digest uses plurals across chats', async () => {
  const db = openDb(':memory:')
  const source = createTeamsSource(fakeApi([
    { chatId: 'c1', chatName: 'Design', messageId: 'm1', fromId: 'u1', createdAt: new Date().toISOString(), isMention: true },
    { chatId: 'c2', chatName: 'QA', messageId: 'm2', fromId: 'u2', createdAt: new Date().toISOString(), isMention: true },
  ]))
  await source.sync(db)
  expect(source.digest(db, new Date()).join('\n')).toContain('Teams: 2 mentions in 2 chats')
})

test('recurring Graph occurrences sharing one iCalUId keep distinct ids', () => {
  const events = toMicrosoftEvents([
    { id: 'occ-1', iCalUId: 'series-uid', subject: 'Standup', start: { dateTime: '2026-11-09T09:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-11-09T09:30:00', timeZone: 'UTC' } },
    { id: 'occ-2', iCalUId: 'series-uid', subject: 'Standup', start: { dateTime: '2026-11-10T09:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-11-10T09:30:00', timeZone: 'UTC' } },
  ])
  expect(events.map((e) => e.id)).toEqual(['occ-1', 'occ-2'])
})

test('calendar source stores both recurring occurrences from Graph', async () => {
  const db = openDb(':memory:')
  const api = {
    async upcoming() {
      return toMicrosoftEvents([
        { id: 'occ-1', iCalUId: 'series-uid', subject: 'Standup', start: { dateTime: '2026-11-09T09:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-11-09T09:30:00', timeZone: 'UTC' } },
        { id: 'occ-2', iCalUId: 'series-uid', subject: 'Standup', start: { dateTime: '2026-11-10T09:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-11-10T09:30:00', timeZone: 'UTC' } },
      ])
    },
  }
  const source = createCalendarSource(api, sourceMeta('calendar', 'microsoft', 'ms-1', 'Work'))
  await source.sync(db)
  const rows = db.prepare('SELECT id FROM calendar_events ORDER BY start').all() as Array<{ id: string }>
  expect(rows.map((r) => r.id)).toEqual(['occ-1', 'occ-2'])
})

test('purgeConnectionData removes teams_mentions for the connection', () => {
  const db = openDb(':memory:')
  const insert = db.prepare(
    'INSERT INTO teams_mentions (connection_id, message_id, chat_id, chat_name, from_id, created_at, is_mention) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  insert.run('conn-a', 'm1', 'c1', 'Design', 'u1', new Date().toISOString(), 1)
  insert.run('conn-b', 'm2', 'c2', 'QA', 'u2', new Date().toISOString(), 1)
  purgeConnectionData(db, 'conn-a')
  const remaining = db.prepare('SELECT connection_id FROM teams_mentions').all() as Array<{ connection_id: string }>
  expect(remaining.map((r) => r.connection_id)).toEqual(['conn-b'])
})
