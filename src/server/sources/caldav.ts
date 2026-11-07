import ICAL from 'ical.js'
import { createDAVClient, type DAVCalendar } from 'tsdav'
import type { CalendarApi, CalendarEvent } from './calendar.js'

export type CalDavCreds = {
  url: string
  username: string
  password: string
  calendarIds?: string[]
}

export type CalDavObject = { url: string; data: string }

const MAX_INSTANCES = 100

/** All-day (DATE) values stay at local midnight so a full-day span reads as "All day". */
function isoTime(time: ICAL.Time): string {
  return time.toJSDate().toISOString()
}

function attendeesOf(event: ICAL.Event): Array<{ email: string; name: string }> {
  return (event.attendees ?? [])
    .map((property) => {
      const value = property.getFirstValue()
      if (typeof value !== 'string') return null
      const email = value.replace(/^mailto:/i, '')
      const name = property.getFirstParameter('cn') || ''
      return email ? { email, name } : null
    })
    .filter((person): person is { email: string; name: string } => person !== null)
}

/**
 * Parses CalDAV calendar objects into CalendarEvents overlapping `[from, to)`.
 * One malformed object or event is skipped; the rest still come through.
 */
export function toCalDavEvents(
  objects: CalDavObject[],
  from: Date,
  to: Date,
  calendarName?: string,
): CalendarEvent[] {
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const events: CalendarEvent[] = []

  for (const object of objects) {
    try {
      const calendarId = calendarName ?? object.url
      const root = new ICAL.Component(ICAL.parse(object.data))
      for (const component of root.getAllSubcomponents('vevent')) {
        try {
          const event = new ICAL.Event(component)
          const uid = event.uid
          if (!uid) continue
          const status =
            component.getFirstPropertyValue('status') === 'CANCELLED' ? 'cancelled' : 'confirmed'
          const base = {
            calendarId,
            summary: event.summary || 'Untitled event',
            location: event.location || null,
            status,
            attendees: attendeesOf(event),
          }

          if (event.isRecurring()) {
            const duration = event.duration ? event.duration.toSeconds() : 0
            // Iterate from DTSTART so COUNT/UNTIL stay anchored to the real start; skip
            // pre-window occurrences without counting them toward the cap, which is only
            // meant to bound how many events we emit inside the requested window.
            const iterator = event.iterator()
            let next: ICAL.Time | null = iterator.next()
            let emitted = 0
            while (next) {
              const start = next.toJSDate()
              if (start.getTime() >= toMs) break
              const end = new Date(start.getTime() + duration * 1000)
              if (end.getTime() > fromMs) {
                if (emitted >= MAX_INSTANCES) break
                emitted++
                events.push({
                  ...base,
                  id: `${uid}#${start.getTime()}`,
                  start: start.toISOString(),
                  end: end.toISOString(),
                })
              }
              try {
                next = iterator.next()
              } catch {
                next = null
              }
            }
          } else {
            const start = event.startDate
            const end = event.endDate ?? event.startDate
            const startMs = start.toJSDate().getTime()
            const endMs = end.toJSDate().getTime()
            if (startMs < toMs && endMs > fromMs) {
              events.push({
                ...base,
                id: uid,
                start: isoTime(start),
                end: isoTime(end),
              })
            }
          }
        } catch {
          // one malformed event must not hide the rest of the calendar
        }
      }
    } catch {
      // one malformed calendar must not hide the rest
    }
  }

  return events
}

/**
 * A read-only CalDAV adapter. The network calls are isolated here; the parser
 * stays pure in `toCalDavEvents`.
 */
export function createCalDavCalendarApi(creds: CalDavCreds | null): CalendarApi | null {
  if (!creds?.url || !creds?.username || !creds?.password) return null
  const wanted = (creds.calendarIds ?? []).map((id) => id.trim()).filter(Boolean)

  return {
    async upcoming(from, to) {
      const client = await createDAVClient({
        serverUrl: creds.url,
        credentials: { username: creds.username, password: creds.password },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      })
      const calendars = await client.fetchCalendars()
      const selected: DAVCalendar[] =
        wanted.length === 0
          ? calendars
          : calendars.filter((calendar) => {
              const name = typeof calendar.displayName === 'string' ? calendar.displayName : ''
              return wanted.some((id) => id === name || id === calendar.url || calendar.url.includes(id))
            })

      const events: CalendarEvent[] = []
      for (const calendar of selected) {
        try {
          const objects = await client.fetchCalendarObjects({
            calendar,
            timeRange: { start: from.toISOString(), end: to.toISOString() },
            expand: false,
          })
          const name = typeof calendar.displayName === 'string' && calendar.displayName
            ? calendar.displayName
            : calendar.url
          events.push(...toCalDavEvents(
            objects.map((object) => ({ url: object.url, data: String(object.data ?? '') })),
            from,
            to,
            name,
          ))
        } catch (error) {
          console.error('CalDAV calendar skipped:', error instanceof Error ? error.message : String(error))
        }
      }
      return events
    },
  }
}
