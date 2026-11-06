import notifier from 'node-notifier'
import type { CalendarEvent } from './sources/calendar.js'

export type DueNotification = { eventId: string; title: string; message: string }

const LEAD_MS = 15 * 60_000
const PREP_LEAD_MS = 30 * 60_000

function dueWithin(
  events: CalendarEvent[],
  now: Date,
  lastNotifiedId: string | null,
  leadMs: number,
  title: string,
): DueNotification | null {
  const nowMs = now.getTime()
  for (const event of events) {
    if (event.status === 'cancelled' || event.id === lastNotifiedId) continue
    const start = Date.parse(event.start)
    const duration = Date.parse(event.end) - start
    if (duration >= 23 * 3_600_000) continue
    if (start < nowMs || start - nowMs > leadMs) continue
    return {
      eventId: event.id,
      title,
      message: `${new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${event.summary}`,
    }
  }
  return null
}

export function dueEventNotification(
  events: CalendarEvent[],
  now: Date,
  lastNotifiedId: string | null,
): DueNotification | null {
  return dueWithin(events, now, lastNotifiedId, LEAD_MS, 'Starting soon')
}

export function dueMeetingPrep(
  events: CalendarEvent[],
  now: Date,
  lastNotifiedId: string | null,
): DueNotification | null {
  return dueWithin(events, now, lastNotifiedId, PREP_LEAD_MS, 'Meeting soon')
}

export function notify(title: string, message: string): void {
  try {
    notifier.notify({ title, message, timeout: 10 })
  } catch (error) {
    console.error('[notify] failed:', error)
  }
}
