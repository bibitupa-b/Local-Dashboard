import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from '../db/index.js'
import { sanitize } from '../briefing/digest.js'
import { isExcludedFolder, isExcludedSender } from '../settings.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

export type MailFolder = { path: string; specialUse?: string }
export type MailMessage = {
  folder: string
  uid: number
  messageId: string | null
  inReplyTo?: string | null
  references?: string[]
  threadKey?: string | null
  sender: string
  subject: string
  date: string
  seen: boolean
  starred: boolean
  snippet: string
  body: string | null
  attachments: string[]
  bulk?: boolean
}
export type MailFlags = { uid: number; seen: boolean; starred: boolean }
export type MailApi = {
  folders(): Promise<MailFolder[]>
  syncFolder(
    folder: string,
    fromUid: number,
  ): Promise<{ messages: MailMessage[]; uidValidity: string; flags: MailFlags[] }>
  /** Current UIDs and flags for a recent window, so moved/deleted mail can be reconciled. */
  recent?(folder: string, days: number): Promise<{ uids: number[]; flags: MailFlags[] }>
  /** Start a push watcher (IMAP IDLE); returns an idempotent stop function. */
  watch?(onChange: () => void): Promise<() => Promise<void>>
}

const IGNORED_FOLDER = /all mail/i

/** The first reference is the thread root; a reply without one still has its own message id. */
export function threadKeyOf(
  messageId: string | null,
  inReplyTo: string | null | undefined,
  references: string[] | undefined,
  subject: string,
): string | null {
  const root = references?.find(Boolean) ?? inReplyTo ?? messageId
  if (root) return root.trim().toLowerCase()
  return subject.trim() ? subject.trim().toLowerCase() : null
}

const SPECIAL_ALIASES: Record<string, string> = {
  '\\Inbox': 'INBOX',
  '\\Important': '[Gmail]/Important',
  '\\Sent': '[Gmail]/Sent Mail',
  '\\Drafts': '[Gmail]/Drafts',
  '\\Junk': '[Gmail]/Spam',
  '\\Trash': '[Gmail]/Trash',
}

function storageFolder(folder: MailFolder): string {
  return (folder.specialUse && SPECIAL_ALIASES[folder.specialUse]) || folder.path
}
export const UNREAD_WINDOW_DAYS = 30

export function createMailSource(api: MailApi | null, meta: SourceMeta = sourceMeta('mail', 'imap')): Source {
  const connectionId = meta.connectionId
  const syncKey = `last_sync_mail:${connectionId}`
  return {
    ...meta,
    configured: () => api !== null,
    watch: api?.watch,
    async sync(db, now = new Date(), progress) {
      if (!api) return
      const folders = (await api.folders()).filter(
        (folder) => !IGNORED_FOLDER.test(folder.path) && !isExcludedFolder(db, folder.path),
      )
      let index = 0
      progress?.(0, folders.length)
      const findFolder = db.prepare(
        'SELECT uid_validity, last_uid FROM mail_folders WHERE connection_id = ? AND path = ?',
      )
      const upsertFolder = db.prepare(
        `INSERT INTO mail_folders (connection_id, path, uid_validity, last_uid, last_sync)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(connection_id, path) DO UPDATE SET
           last_uid = CASE
             WHEN mail_folders.uid_validity = excluded.uid_validity
             THEN MAX(mail_folders.last_uid, excluded.last_uid)
             ELSE excluded.last_uid
           END,
           uid_validity = excluded.uid_validity,
           last_sync = excluded.last_sync`,
      )
      const insertMessage = db.prepare(
        `INSERT INTO mail_messages
           (connection_id, folder, uid, message_id, in_reply_to, references_json, thread_key,
            sender, subject, date, seen, starred, snippet, body, attachments, bulk)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(connection_id, folder, uid) DO UPDATE SET seen = excluded.seen, starred = excluded.starred,
           bulk = excluded.bulk, in_reply_to = excluded.in_reply_to,
           references_json = excluded.references_json, thread_key = excluded.thread_key`,
      )
      const updateFlags = db.prepare(
        'UPDATE mail_messages SET seen = ?, starred = ? WHERE connection_id = ? AND folder = ? AND uid = ?',
      )
      const maxUid = db.prepare(
        'SELECT COALESCE(MAX(uid), 0) AS uid FROM mail_messages WHERE connection_id = ? AND folder = ?',
      )

      for (const folder of folders) {
        const dbPath = storageFolder(folder)
        try {
          const row = findFolder.get(connectionId, dbPath) as
            | { uid_validity: string; last_uid: number }
            | undefined
          const fromUid = row?.last_uid ?? 0
          let result = await api.syncFolder(folder.path, fromUid)

          if (row && result.uidValidity !== row.uid_validity) {
            // The server renumbered the folder; fetch the new list before dropping the old rows.
            result = await api.syncFolder(folder.path, 0)
            db.prepare('DELETE FROM mail_messages WHERE connection_id = ? AND folder = ?').run(
              connectionId,
              dbPath,
            )
          }
          const { messages, uidValidity, flags } = result

          for (const message of messages) {
            insertMessage.run(
              connectionId,
              dbPath,
              message.uid,
              message.messageId,
              message.inReplyTo ?? null,
              JSON.stringify(message.references ?? []),
              message.threadKey ??
                threadKeyOf(
                  message.messageId,
                  message.inReplyTo,
                  message.references,
                  message.subject,
                ),
              message.sender,
              message.subject,
              message.date,
              message.seen ? 1 : 0,
              message.starred ? 1 : 0,
              message.snippet,
              message.body,
              JSON.stringify(message.attachments),
              message.bulk ? 1 : 0,
            )
          }
          for (const flag of flags) {
            updateFlags.run(
              flag.seen ? 1 : 0,
              flag.starred ? 1 : 0,
              connectionId,
              dbPath,
              flag.uid,
            )
          }

          // IMAP only tells us about new UIDs. Reconcile the unread window so archived or deleted
          // mail stops being counted as unread forever.
          if (api.recent && (dbPath === 'INBOX' || dbPath === '[Gmail]/Important')) {
            try {
              const recent = await api.recent(folder.path, 30)
              const present = new Set(recent.uids)
              const windowStart = new Date(now.getTime() - 30 * 86_400_000).toISOString()
              const rows = db
                .prepare(
                  'SELECT uid FROM mail_messages WHERE connection_id = ? AND folder = ? AND date >= ?',
                )
                .all(connectionId, dbPath, windowStart) as Array<{ uid: number }>
              const remove = db.prepare(
                'DELETE FROM mail_messages WHERE connection_id = ? AND folder = ? AND uid = ?',
              )
              for (const row of rows) {
                if (!present.has(row.uid)) remove.run(connectionId, dbPath, row.uid)
              }
              for (const flag of recent.flags) {
                updateFlags.run(
                  flag.seen ? 1 : 0,
                  flag.starred ? 1 : 0,
                  connectionId,
                  dbPath,
                  flag.uid,
                )
              }
            } catch (error) {
              // Reconciliation is best effort; the new messages are already stored.
              console.error(`[mail] reconcile ${dbPath} failed:`, error)
            }
          }

        const highest = (maxUid.get(connectionId, dbPath) as { uid: number }).uid
          upsertFolder.run(connectionId, dbPath, uidValidity, highest, now.toISOString())
        } catch (error) {
          // One broken folder must not stop the rest of the mailbox.
          console.error(`[mail] folder ${dbPath} failed:`, error)
        }
        progress?.(++index, folders.length)
      }

      const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString()
      db.prepare('UPDATE mail_messages SET body = NULL, snippet = ? WHERE date < ? AND body IS NOT NULL').run(
        '',
        cutoff,
      )
      setSetting(db, syncKey, now.toISOString())
    },
    lastSync: (db) => getSetting(db, syncKey),
    digest: (db, since) => {
      const rows = db
        .prepare(
          `SELECT sender, subject, snippet, COALESCE(message_id, connection_id || ':' || folder || ':' || uid) AS key
           FROM mail_messages
           WHERE seen = 0 AND bulk = 0 AND folder IN ('INBOX', '[Gmail]/Important') AND date >= ?
           ORDER BY date DESC`,
        )
        .all(since.toISOString()) as Array<{
        sender: string
        subject: string
        snippet: string
        key: string
      }>
      const seen = new Set<string>()
      const fresh = rows.filter((message) => {
        if (seen.has(message.key) || isExcludedSender(db, message.sender)) return false
        seen.add(message.key)
        return true
      })
      // No total: the unread pile is counted once, in `Needs attention`, and the page prints that number.
      return fresh.slice(0, 12).map((message) => {
        const line = `${sanitize(message.sender, 80)}: ${sanitize(message.subject, 120)}`
        // Bodies expire after 90 days, leaving no snippet: a trailing dash would read as a missing value.
        const snippet = sanitize(message.snippet, 200)
        return snippet ? `${line} — ${snippet}` : line
      })
    },
  }
}
