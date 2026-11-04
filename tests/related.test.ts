import { expect, test } from 'vitest'
import { meetingLinks, parseAttendees, type MeetingEvent } from '../src/server/briefing/related.js'

const NOW = new Date(2026, 10, 4, 12, 0)
const ANNA = { email: 'anna@example.com', name: 'Anna' }

function event(overrides: Partial<MeetingEvent> = {}): MeetingEvent {
  return {
    summary: 'Sync',
    start: new Date(2026, 10, 4, 14, 30).toISOString(),
    attendees: [ANNA],
    ...overrides,
  }
}

function mail(sender: string, subject: string, daysAgo: number) {
  return {
    sender,
    subject,
    date: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  }
}

test('a meeting with recent mail from an attendee gets one line', () => {
  const lines = meetingLinks(
    [event()],
    [mail('Anna <anna@example.com>', 'Re: budget', 3)],
    NOW,
  )
  expect(lines).toEqual(['14:30 Sync — last mail from Anna: «Re: budget» (3 d ago)'])
})

test('mail older than thirty days is not prep', () => {
  expect(
    meetingLinks([event()], [mail('anna@example.com', 'Old news', 31)], NOW),
  ).toEqual([])
})

test('an event without attendees gets no line', () => {
  expect(
    meetingLinks([event({ attendees: [] })], [mail('anna@example.com', 'Hello', 1)], NOW),
  ).toEqual([])
})

test('two meetings with one attendee are two lines', () => {
  const lines = meetingLinks(
    [
      event(),
      event({
        summary: 'Design review',
        start: new Date(2026, 10, 4, 16, 0).toISOString(),
      }),
    ],
    [mail('anna@example.com', 'Re: budget', 2)],
    NOW,
  )
  expect(lines).toHaveLength(2)
  expect(lines[0]).toContain('Sync')
  expect(lines[1]).toContain('Design review')
})

test('meetings beyond the next day are not prep yet', () => {
  expect(
    meetingLinks(
      [event({ start: new Date(2026, 10, 6, 10, 0).toISOString() })],
      [mail('anna@example.com', 'Hello', 1)],
      NOW,
    ),
  ).toEqual([])
})

test('stored attendees survive broken JSON and skip nameless rows', () => {
  expect(parseAttendees('not json')).toEqual([])
  expect(parseAttendees('{"email":"a@b.c"}')).toEqual([])
  expect(parseAttendees('[{"email":"a@b.c","name":"A"},{"name":"No address"}]')).toEqual([
    { email: 'a@b.c', name: 'A' },
  ])
})
