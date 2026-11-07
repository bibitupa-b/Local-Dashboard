import { graph, type MicrosoftCreds } from '../microsoft.js'
import type { CalendarApi, CalendarEvent } from './calendar.js'

export type MicrosoftGraphEvent = {
  id?: string
  iCalUId?: string | null
  subject?: string
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  location?: { displayName?: string } | null
  isCancelled?: boolean
  attendees?: Array<{ emailAddress?: { address?: string; name?: string } }>
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const MAX_PAGES = 5

/** Graph reports local time plus a named zone; a stored event must be one UTC instant. */
function zonedIso(dateTime: string | undefined, timeZone: string | undefined): string {
  if (!dateTime) return ''
  const probe = new Date(`${dateTime.replace(/\.\d+(?=$|Z)/, '')}Z`)
  if (Number.isNaN(probe.getTime())) return dateTime
  return new Date(probe.getTime() - offsetMs(probe, timeZone || 'UTC')).toISOString()
}

function offsetMs(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date)
    const pick = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0)
    const asUtc = Date.UTC(
      pick('year'),
      pick('month') - 1,
      pick('day'),
      pick('hour') % 24,
      pick('minute'),
      pick('second'),
    )
    return asUtc - Math.floor(date.getTime() / 1000) * 1000
  } catch {
    return 0
  }
}

export function toMicrosoftEvents(items: MicrosoftGraphEvent[]): CalendarEvent[] {
  return items.flatMap<CalendarEvent>((item) => {
    // Each calendarView occurrence has a unique id; iCalUId is shared across the series.
    const id = item.id ?? item.iCalUId
    if (!id) return []
    return [
      {
        id,
        calendarId: 'microsoft',
        summary: item.subject ?? '(no title)',
        start: zonedIso(item.start?.dateTime, item.start?.timeZone),
        end: zonedIso(item.end?.dateTime, item.end?.timeZone),
        location: item.location?.displayName ?? null,
        status: item.isCancelled ? 'cancelled' : 'confirmed',
        attendees: (item.attendees ?? [])
          .map((attendee) => ({
            email: attendee.emailAddress?.address ?? '',
            name: attendee.emailAddress?.name ?? '',
          }))
          .filter((attendee) => attendee.email),
      },
    ]
  })
}

export function createMicrosoftCalendarApi(creds: MicrosoftCreds | null): CalendarApi | null {
  if (!creds?.tokens) return null
  return {
    async upcoming(from, to) {
      const select = 'id,subject,start,end,location,isCancelled,attendees,iCalUId'
      let path = `/me/calendarView?startDateTime=${encodeURIComponent(
        from.toISOString(),
      )}&endDateTime=${encodeURIComponent(to.toISOString())}&$top=100&$select=${select}`
      const events: CalendarEvent[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await graph<{ value?: MicrosoftGraphEvent[]; '@odata.nextLink'?: string }>(creds, path)
        events.push(...toMicrosoftEvents(data.value ?? []))
        const next = data['@odata.nextLink']
        if (!next) break
        const nextPath = next.startsWith(GRAPH_BASE) ? next.slice(GRAPH_BASE.length) : null
        if (!nextPath?.startsWith('/')) break
        path = nextPath
      }
      return events
    },
  }
}
