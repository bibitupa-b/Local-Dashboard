import notifier from 'node-notifier'
import type { CalendarEvent } from './sources/calendar.js'

export type DueNotification = { eventId: string; title: string; message: string }

const LEAD_MS = 15 * 60_000

export function dueEventNotification(
  events: CalendarEvent[],
  now: Date,
  lastNotifiedId: string | null,
): DueNotification | null {
  const nowMs = now.getTime()
  for (const event of events) {
    if (event.status === 'cancelled' || event.id === lastNotifiedId) continue
    const start = Date.parse(event.start)
    const duration = Date.parse(event.end) - start
    if (duration >= 23 * 3_600_000) continue
    if (start < nowMs || start - nowMs > LEAD_MS) continue
    return {
      eventId: event.id,
      title: 'Starting soon',
      message: `${new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${event.summary}`,
    }
  }
  return null
}

export function notify(title: string, message: string): void {
  try {
    notifier.notify({ title, message, timeout: 10 })
  } catch (error) {
    console.error('[notify] failed:', error)
  }
}
