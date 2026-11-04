import { sanitize } from './digest.js'

export type MeetingEvent = {
  summary: string
  start: string
  attendees: Array<{ email: string; name: string }>
}

export type MeetingMail = { sender: string; subject: string; date: string }

const HORIZON_MS = 24 * 3_600_000
const MAIL_WINDOW_MS = 30 * 86_400_000
const MAX_MEETINGS = 3

/** Attendees come back as stored JSON; a broken row means no attendees, never a crash. */
export function parseAttendees(raw: string): Array<{ email: string; name: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      const person = entry as { email?: unknown; name?: unknown }
      return typeof person?.email === 'string' && person.email.includes('@')
        ? [{ email: person.email, name: typeof person.name === 'string' ? person.name : '' }]
        : []
    })
  } catch {
    return []
  }
}

function age(days: number): string {
  return days === 0 ? 'today' : `${days} d ago`
}

/**
 * Meeting prep: for the next three events with attendees, the last mail from one of them.
 * It links by address only — a guessed name link is worse than no link.
 */
export function meetingLinks(
  events: MeetingEvent[],
  mails: MeetingMail[],
  now: Date,
): string[] {
  const from = now.getTime()
  const until = from + HORIZON_MS
  const cutoff = from - MAIL_WINDOW_MS
  const lines: string[] = []

  for (const event of [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    if (lines.length >= MAX_MEETINGS) break
    const start = Date.parse(event.start)
    if (Number.isNaN(start) || start < from || start > until) continue
    const people = event.attendees.filter((person) => person.email.includes('@'))
    if (people.length === 0) continue

    let last: {
      person: { email: string; name: string }
      mail: MeetingMail
      at: number
    } | null = null
    for (const mail of mails) {
      const at = Date.parse(mail.date)
      if (Number.isNaN(at) || at < cutoff) continue
      const sender = mail.sender.toLowerCase()
      const person = people.find((person) => sender.includes(person.email.toLowerCase()))
      if (!person) continue
      if (!last || at > last.at) last = { person, mail, at }
    }
    if (!last) continue

    const time = new Date(start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const who = sanitize(last.person.name || last.person.email.split('@')[0]!, 60)
    const subject = sanitize(last.mail.subject, 80)
    const days = Math.max(0, Math.floor((from - last.at) / 86_400_000))
    lines.push(
      `${time} ${sanitize(event.summary, 80)} — last mail from ${who}: «${subject}» (${age(days)})`,
    )
  }
  return lines
}
