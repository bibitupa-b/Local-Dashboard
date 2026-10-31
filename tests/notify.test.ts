import { expect, test } from 'vitest'
import { dueEventNotification } from '../src/server/notify.js'
import type { CalendarEvent } from '../src/server/sources/calendar.js'

const now = new Date('2026-10-31T12:00:00.000Z')

function event(id: string, minutesFromNow: number, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const start = new Date(now.getTime() + minutesFromNow * 60_000).toISOString()
  return {
    id,
    calendarId: 'primary',
    summary: id,
    start,
    end: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
    location: null,
    status: 'confirmed',
    ...overrides,
  }
}

test('notifies for an event starting within 15 minutes', () => {
  const due = dueEventNotification([event('Standup', 10)], now, null)
  expect(due?.eventId).toBe('Standup')
  expect(due?.message).toContain('Standup')
})

test('does not repeat the same event', () => {
  expect(dueEventNotification([event('Standup', 10)], now, 'Standup')).toBeNull()
})

test('ignores past, far away, cancelled and all-day events', () => {
  expect(dueEventNotification([event('Past', -5)], now, null)).toBeNull()
  expect(dueEventNotification([event('Later', 60)], now, null)).toBeNull()
  expect(dueEventNotification([event('Cancelled', 10, { status: 'cancelled' })], now, null)).toBeNull()
  expect(
    dueEventNotification(
      [
        {
          ...event('Holiday', 10),
          end: new Date(now.getTime() + 24 * 3_600_000).toISOString(),
        },
      ],
      now,
      null,
    ),
  ).toBeNull()
})
