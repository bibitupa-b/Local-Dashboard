import type { DatabaseSync } from 'node:sqlite'
import { google } from 'googleapis'
import { setSetting } from '../db/index.js'
import { authorizedClient } from '../google.js'
import type { Source } from './types.js'
import type { Config } from '../config.js'

export type CalendarEvent = {
  id: string
  calendarId: string
  summary: string
  start: string
  end: string
  location: string | null
  status: string
}

export type CalendarApi = {
  upcoming(from: Date, to: Date): Promise<CalendarEvent[]>
}

export function localDayBounds(now: Date): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 86_400_000)
  return { from: start.toISOString(), to: end.toISOString() }
}

export function createCalendarSource(api: CalendarApi | null): Source {
  return {
    id: 'calendar',
    configured: () => api !== null,
    async sync(db, now = new Date()) {
      if (!api) return
      const from = new Date(now.getTime() - 86_400_000)
      const to = new Date(now.getTime() + 7 * 86_400_000)
      const events = await api.upcoming(from, to)

      const insert = db.prepare(
        `INSERT INTO calendar_events (id, calendar_id, summary, start, end, location, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET summary = excluded.summary, start = excluded.start,
           end = excluded.end, location = excluded.location, status = excluded.status`,
      )
      db.prepare('DELETE FROM calendar_events').run()
      for (const event of events) {
        insert.run(
          event.id,
          event.calendarId,
          event.summary,
          event.start,
          event.end,
          event.location,
          event.status,
        )
      }
      setSetting(db, 'last_sync_calendar', now.toISOString())
    },
    lastSync: (db) =>
      (db.prepare("SELECT value FROM settings WHERE key = 'last_sync_calendar'").get() as
        | { value: string }
        | undefined)?.value ?? null,
    digest: (db, _since) => {
      const { from, to } = localDayBounds(new Date())
      const rows = db
        .prepare(
          `SELECT summary, start, end FROM calendar_events
           WHERE start < ? AND end > ? AND status != 'cancelled' ORDER BY start`,
        )
        .all(to, from) as Array<{ summary: string; start: string; end: string }>
      if (rows.length === 0) return ['No events today']
      return rows.map((row) => {
        const time = new Date(row.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return `${time} ${row.summary}`
      })
    },
  }
}

export async function createGoogleCalendarApi(config: Config): Promise<CalendarApi | null> {
  const client = await authorizedClient(config)
  if (!client) return null
  const calendar = google.calendar({ version: 'v3', auth: client })

  return {
    async upcoming(from, to) {
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      })
      return (res.data.items ?? []).flatMap((event) => {
        const start = event.start?.dateTime ?? event.start?.date
        const end = event.end?.dateTime ?? event.end?.date
        if (!event.id || !start || !end) return []
        return [
          {
            id: event.id,
            calendarId: 'primary',
            summary: event.summary ?? '(no title)',
            start,
            end,
            location: event.location ?? null,
            status: event.status ?? 'confirmed',
          },
        ]
      })
    },
  }
}

export function todayEvents(db: DatabaseSync, now: Date): CalendarEvent[] {
  const { from, to } = localDayBounds(now)
  return db
    .prepare(
      `SELECT id, calendar_id AS calendarId, summary, start, end, location, status
       FROM calendar_events WHERE start < ? AND end > ? AND status != 'cancelled' ORDER BY start`,
    )
    .all(to, from) as CalendarEvent[]
}
