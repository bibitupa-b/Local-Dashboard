import type { DatabaseSync } from 'node:sqlite'
import { setSetting } from '../db/index.js'
import type { Source } from './types.js'

export type MailFolder = { path: string }
export type MailMessage = {
  folder: string
  uid: number
  messageId: string | null
  sender: string
  subject: string
  date: string
  seen: boolean
  starred: boolean
  snippet: string
  body: string | null
  attachments: string[]
}
export type MailFlags = { uid: number; seen: boolean; starred: boolean }
export type MailApi = {
  folders(): Promise<MailFolder[]>
  syncFolder(
    folder: string,
    fromUid: number,
  ): Promise<{ messages: MailMessage[]; uidValidity: string; flags: MailFlags[] }>
}

const IGNORED_FOLDER = /all mail/i
export const UNREAD_WINDOW_DAYS = 30

export function createMailSource(api: MailApi | null): Source {
  return {
    id: 'mail',
    configured: () => api !== null,
    async sync(db, now = new Date()) {
      if (!api) return
      const folders = await api.folders()
      const findFolder = db.prepare('SELECT uid_validity, last_uid FROM mail_folders WHERE path = ?')
      const upsertFolder = db.prepare(
        `INSERT INTO mail_folders (path, uid_validity, last_uid, last_sync) VALUES (?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET uid_validity = excluded.uid_validity,
           last_uid = MAX(mail_folders.last_uid, excluded.last_uid), last_sync = excluded.last_sync`,
      )
      const insertMessage = db.prepare(
        `INSERT INTO mail_messages
           (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(folder, uid) DO UPDATE SET seen = excluded.seen, starred = excluded.starred`,
      )
      const updateFlags = db.prepare(
        'UPDATE mail_messages SET seen = ?, starred = ? WHERE folder = ? AND uid = ?',
      )
      const maxUid = db.prepare('SELECT COALESCE(MAX(uid), 0) AS uid FROM mail_messages WHERE folder = ?')

      for (const folder of folders) {
        if (IGNORED_FOLDER.test(folder.path)) continue
        const row = findFolder.get(folder.path) as
          | { uid_validity: string; last_uid: number }
          | undefined
        let fromUid = row?.last_uid ?? 0
        let result = await api.syncFolder(folder.path, fromUid)

        if (row && result.uidValidity !== row.uid_validity) {
          // The server renumbered the folder; cached UIDs are meaningless.
          db.prepare('DELETE FROM mail_messages WHERE folder = ?').run(folder.path)
          fromUid = 0
          result = await api.syncFolder(folder.path, 0)
        }
        const { messages, uidValidity, flags } = result

        for (const message of messages) {
          insertMessage.run(
            message.folder,
            message.uid,
            message.messageId,
            message.sender,
            message.subject,
            message.date,
            message.seen ? 1 : 0,
            message.starred ? 1 : 0,
            message.snippet,
            message.body,
            JSON.stringify(message.attachments),
          )
        }
        for (const flag of flags) {
          updateFlags.run(flag.seen ? 1 : 0, flag.starred ? 1 : 0, folder.path, flag.uid)
        }
        const highest = (maxUid.get(folder.path) as { uid: number }).uid
        upsertFolder.run(folder.path, uidValidity, highest, now.toISOString())
      }
      setSetting(db, 'last_sync_mail', now.toISOString())
    },
    lastSync: (db) =>
      (db.prepare("SELECT value FROM settings WHERE key = 'last_sync_mail'").get() as
        | { value: string }
        | undefined)?.value ?? null,
    digest: (db) => {
      const since = new Date(Date.now() - UNREAD_WINDOW_DAYS * 86_400_000).toISOString()
      const unread = db
        .prepare(
          `SELECT sender, subject, snippet FROM mail_messages
           WHERE seen = 0 AND folder IN ('INBOX', '[Gmail]/Important') AND date >= ?
           ORDER BY date DESC LIMIT 12`,
        )
        .all(since) as Array<{ sender: string; subject: string; snippet: string }>
      const total = db
        .prepare(
          `SELECT COUNT(*) AS n FROM mail_messages
           WHERE seen = 0 AND folder IN ('INBOX', '[Gmail]/Important') AND date >= ?`,
        )
        .get(since) as { n: number }
      if (unread.length === 0) return [`Unread mail: ${total.n}`]
      return [
        `Unread mail: ${total.n}`,
        ...unread.map((message) => `${message.sender}: ${message.subject} — ${message.snippet}`),
      ]
    },
  }
}
