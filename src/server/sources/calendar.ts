import type { DatabaseSync } from 'node:sqlite'
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { setSetting } from '../db/index.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

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

export function createCalendarSource(api: CalendarApi | null, meta: SourceMeta = sourceMeta('calendar', 'google')): Source {
  return {
    ...meta,
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
      db.exec('BEGIN')
      try {
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
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
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
        const allDay = Date.parse(row.end) - Date.parse(row.start) >= 23 * 3_600_000
        const time = allDay
          ? 'All day'
          : new Date(row.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return `${time} ${row.summary}`
      })
    },
  }
}

export function createGoogleCalendarApi(client: OAuth2Client | null): CalendarApi | null {
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
            start: localIso(start),
            end: localIso(end),
            location: event.location ?? null,
            status: event.status ?? 'confirmed',
          },
        ]
      })
    },
  }
}

// All-day events arrive as YYYY-MM-DD; treat them as local midnight, not UTC.
function localIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`).toISOString() : value
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

export type DayPlan = {
  free: Array<{ from: string; to: string }>
  conflicts: string[]
}

const WORK_START = 9
const WORK_END = 19
const MIN_GAP_MS = 30 * 60_000

export function dayPlan(events: CalendarEvent[], now: Date): DayPlan {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), WORK_START)
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), WORK_END)
  const from = Math.max(dayStart.getTime(), now.getTime())

  const busy = events
    .filter((event) => event.status !== 'cancelled')
    .filter((event) => Date.parse(event.end) - Date.parse(event.start) < 23 * 3_600_000)
    .map((event) => ({
      start: Math.max(Date.parse(event.start), from),
      end: Math.min(Date.parse(event.end), dayEnd.getTime()),
      summary: event.summary,
    }))
    .filter((slot) => slot.end > slot.start)
    .sort((a, b) => a.start - b.start)

  const merged: Array<{ start: number; end: number }> = []
  const conflicts: string[] = []
  for (const slot of busy) {
    const last = merged.at(-1)
    if (!last) {
      merged.push({ start: slot.start, end: slot.end })
      continue
    }
    if (slot.start < last.end) {
      conflicts.push(slot.summary)
      last.end = Math.max(last.end, slot.end)
    } else {
      merged.push({ start: slot.start, end: slot.end })
    }
  }

  const free: Array<{ from: string; to: string }> = []
  let cursor = from
  for (const slot of merged) {
    if (slot.start - cursor >= MIN_GAP_MS) {
      free.push({ from: new Date(cursor).toISOString(), to: new Date(slot.start).toISOString() })
    }
    cursor = Math.max(cursor, slot.end)
  }
  if (dayEnd.getTime() - cursor >= MIN_GAP_MS) {
    free.push({ from: new Date(cursor).toISOString(), to: dayEnd.toISOString() })
  }

  return { free, conflicts: [...new Set(conflicts)] }
}
