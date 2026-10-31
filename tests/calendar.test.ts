import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import { createCalendarSource, localDayBounds, type CalendarApi, type CalendarEvent } from '../src/server/sources/calendar.js'

const NOW = new Date('2026-10-31T12:00:00.000Z')

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    calendarId: 'primary',
    summary: 'Standup',
    start: '2026-10-31T13:00:00.000Z',
    end: '2026-10-31T13:30:00.000Z',
    location: null,
    status: 'confirmed',
    ...overrides,
  }
}

function fakeApi(events: CalendarEvent[]) {
  const calls: Array<{ from: string; to: string }> = []
  const api: CalendarApi = {
    upcoming: async (from, to) => {
      calls.push({ from: from.toISOString(), to: to.toISOString() })
      return events
    },
  }
  return { api, calls }
}

test('stores the requested window and drops events that disappeared', async () => {
  const db = openDb(':memory:')
  const { api, calls } = fakeApi([event(), event({ id: 'e2', summary: 'Gym' })])
  const source = createCalendarSource(api)

  await source.sync(db, NOW)
  expect(db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get()).toEqual({ n: 2 })
  expect(calls[0]!.to > calls[0]!.from).toBe(true)

  const removed = fakeApi([event({ id: 'e1' })])
  await createCalendarSource(removed.api).sync(db, NOW)
  expect(db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get()).toEqual({ n: 1 })
})

test('cancelled events stay out of the digest and attention', async () => {
  const db = openDb(':memory:')
  await createCalendarSource(fakeApi([event({ status: 'cancelled' })]).api).sync(db, NOW)

  const source = createCalendarSource(null)
  const lines = createCalendarSource(fakeApi([]).api).digest(db, NOW)
  expect(lines.join('\n')).toContain('No events today')
  expect(source.configured()).toBe(false)
})

test('digest shows today in local time and skips tomorrow', async () => {
  const db = openDb(':memory:')
  const { from } = localDayBounds(new Date())
  const start = new Date(Date.parse(from) + 9 * 3_600_000).toISOString()
  const end = new Date(Date.parse(from) + 10 * 3_600_000).toISOString()
  const tomorrow = new Date(Date.parse(from) + 30 * 3_600_000).toISOString()
  const events = [
    event({ id: 'today', summary: 'Deep work', start, end }),
    event({ id: 'tomorrow', summary: 'Later thing', start: tomorrow, end: new Date(Date.parse(tomorrow) + 3_600_000).toISOString() }),
  ]
  await createCalendarSource(fakeApi(events).api).sync(db, new Date())

  const lines = createCalendarSource(fakeApi([]).api).digest(db, new Date())
  expect(lines.join('\n')).toContain('Deep work')
  expect(lines.join('\n')).not.toContain('Later thing')
})

test('attention surfaces the next event', async () => {
  const db = openDb(':memory:')
  const start = new Date(Date.now() + 3_600_000).toISOString()
  const end = new Date(Date.now() + 5_400_000).toISOString()
  await createCalendarSource(fakeApi([event({ summary: 'Call with Alice', start, end })]).api).sync(db)

  const items = buildAttention(db, new Date(), { staleDays: 14, inboxDays: 3 })
  const item = items.find((entry) => entry.kind === 'calendar')
  expect(item?.label).toBe('Call with Alice')
})
