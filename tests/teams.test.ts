import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import { createTeamsSource, type TeamsApi, type TeamsMention } from '../src/server/sources/teams.js'
import { toMicrosoftEvents } from '../src/server/sources/microsoft-calendar.js'

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
