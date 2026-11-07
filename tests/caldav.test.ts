import { expect, test } from 'vitest'
import { toCalDavEvents } from '../src/server/sources/caldav.js'

const timed = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1
DTSTART:20261107T100000Z
DTEND:20261107T110000Z
SUMMARY:Design review
LOCATION:Room 2
END:VEVENT
END:VCALENDAR`

const allDay = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:2
DTSTART;VALUE=DATE:20261108
DTEND;VALUE=DATE:20261109
SUMMARY:Day off
END:VEVENT
END:VCALENDAR`

test('parses timed and all-day events in the window', () => {
  const events = toCalDavEvents(
    [{ url: 'x', data: timed }, { url: 'y', data: allDay }],
    new Date('2026-11-07T00:00:00Z'),
    new Date('2026-11-10T00:00:00Z'),
  )
  expect(events.map((event) => event.summary)).toEqual(['Design review', 'Day off'])
  expect(events[0]?.start).toBe('2026-11-07T10:00:00.000Z')
})

test('drops malformed events without dropping the calendar', () => {
  const events = toCalDavEvents(
    [{ url: 'bad', data: 'not a calendar' }, { url: 'good', data: timed }],
    new Date('2026-11-07T00:00:00Z'),
    new Date('2026-11-10T00:00:00Z'),
  )
  expect(events.map((event) => event.summary)).toEqual(['Design review'])
})

const weekly = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:3
DTSTART:20261102T090000Z
DTEND:20261102T093000Z
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Standup
END:VEVENT
END:VCALENDAR`

test('expands recurring events inside the window', () => {
  const events = toCalDavEvents(
    [{ url: 'r', data: weekly }],
    new Date('2026-11-07T00:00:00Z'),
    new Date('2026-11-10T00:00:00Z'),
  )
  expect(events.map((event) => event.start)).toContain('2026-11-09T09:00:00.000Z')
})
