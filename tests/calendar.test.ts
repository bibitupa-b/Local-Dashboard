import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import {
  createCalendarSource,
  dayPlan,
  localDayBounds,
  parseCalendarIds,
  type CalendarApi,
  type CalendarEvent,
} from '../src/server/sources/calendar.js'

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

test('calendar ids are trimmed, deduplicated and default to primary', () => {
  expect(parseCalendarIds(undefined)).toEqual(['primary'])
  expect(parseCalendarIds(' primary, work ,, work ')).toEqual(['primary', 'work'])
})

test('events from more than one calendar keep their calendar id', async () => {
  const db = openDb(':memory:')
  await createCalendarSource(
    fakeApi([
      event({ id: 'e1', calendarId: 'primary', summary: 'Personal' }),
      event({ id: 'e2', calendarId: 'work', summary: 'Planning' }),
    ]).api,
  ).sync(db, NOW)

  expect(
    db.prepare('SELECT calendar_id FROM calendar_events ORDER BY id').all(),
  ).toEqual([{ calendar_id: 'primary' }, { calendar_id: 'work' }])
})

test('free windows follow the configured work hours', () => {
  const now = new Date(2026, 9, 31, 7, 0)
  const eventStart = new Date(2026, 9, 31, 10, 0).toISOString()
  const eventEnd = new Date(2026, 9, 31, 11, 0).toISOString()

  const plan = dayPlan(
    [event({ start: eventStart, end: eventEnd })],
    now,
    { start: 8, end: 12 },
  )
  expect(plan.free.map((window) => [new Date(window.from).getHours(), new Date(window.to).getHours()])).toEqual([
    [8, 10],
    [11, 12],
  ])
})

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
