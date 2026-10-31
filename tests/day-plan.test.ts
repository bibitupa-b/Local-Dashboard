import { expect, test } from 'vitest'
import { dayPlan, type CalendarEvent } from '../src/server/sources/calendar.js'

function at(hour: number, minute = 0): string {
  return new Date(2026, 9, 31, hour, minute).toISOString()
}

function event(id: string, start: string, end: string, summary = id): CalendarEvent {
  return { id, calendarId: 'primary', summary, start, end, location: null, status: 'confirmed' }
}

const morning = new Date(2026, 9, 31, 8, 0)

test('finds gaps around meetings and ignores all-day events', () => {
  const plan = dayPlan(
    [event('a', at(10), at(11)), event('b', at(12), at(13)), event('day', at(0), at(23, 59), 'Holiday')],
    morning,
  )
  expect(plan.conflicts).toEqual([])
  expect(plan.free.map((window) => [window.from, window.to])).toEqual([
    [at(9), at(10)],
    [at(11), at(12)],
    [at(13), at(19)],
  ])
})

test('overlapping meetings merge and are reported once', () => {
  const plan = dayPlan(
    [event('a', at(11), at(12), 'One'), event('b', at(11, 30), at(13), 'Two')],
    morning,
  )
  expect(plan.conflicts).toEqual(['Two'])
  expect(plan.free).toEqual([
    { from: at(9), to: at(11) },
    { from: at(13), to: at(19) },
  ])
})

test('gaps shorter than 30 minutes are not offered', () => {
  const plan = dayPlan([event('a', at(10), at(11)), event('b', at(11, 15), at(12))], morning)
  expect(plan.free.some((window) => window.from === at(11))).toBe(false)
})

test('starts from now, not from nine, when the day is already underway', () => {
  const plan = dayPlan([event('a', at(14), at(15))], new Date(2026, 9, 31, 13, 0))
  expect(plan.free[0]).toEqual({ from: at(13), to: at(14) })
})
