import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from '../db/index.js'
import { sanitize } from '../briefing/digest.js'
import { graph, type MicrosoftCreds } from '../microsoft.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

export type TeamsMention = {
  chatId: string
  chatName: string
  messageId: string
  fromId: string
  createdAt: string
  isMention: boolean
}

export type TeamsApi = { mentions(): Promise<TeamsMention[]> }

type MicrosoftChat = {
  id?: string
  chatType?: string
  topic?: string | null
  members?: Array<{ userId?: string; displayName?: string }>
}

type MicrosoftChatMessage = {
  id?: string
  createdDateTime?: string
  from?: { user?: { id?: string } | null }
  mentions?: Array<{ mentioned?: { user?: { id?: string } | null } }>
}

const MAX_CHATS = 50
const WINDOW_MS = 24 * 3_600_000

function otherMemberName(chat: MicrosoftChat, me: string): string {
  return (
    (chat.members ?? []).find((member) => (member.userId ?? '') !== me)?.displayName?.trim() ?? ''
  )
}

/**
 * Personal and group chats only. Mentions come from explicit `mentions` in group chats; a
 * one-on-one chat treats every message from the other member as a mention. Message text is
 * never read: only ids, names, sender and time are returned.
 */
export function createMicrosoftTeamsApi(creds: MicrosoftCreds | null, selfId?: string): TeamsApi | null {
  if (!creds?.tokens) return null
  return {
    async mentions() {
      const me = selfId?.trim() || (await graph<{ id: string }>(creds, '/me?$select=id')).id
      const chats = await graph<{ value?: MicrosoftChat[] }>(creds, '/me/chats?$top=50&$expand=members')
      const cutoff = Date.now() - WINDOW_MS
      const result: TeamsMention[] = []
      for (const chat of (chats.value ?? []).slice(0, MAX_CHATS)) {
        if (!chat.id) continue
        try {
          const chatName = chat.topic?.trim() || otherMemberName(chat, me) || chat.id
          const page = await graph<{ value?: MicrosoftChatMessage[] }>(
            creds,
            `/me/chats/${chat.id}/messages?$top=50`,
          )
          for (const message of page.value ?? []) {
            if (!message.id || !message.createdDateTime) continue
            if (Date.parse(message.createdDateTime) < cutoff) continue
            const fromId = message.from?.user?.id ?? ''
            if (!fromId) continue
            const isMention =
              chat.chatType === 'oneOnOne'
                ? fromId !== me
                : (message.mentions?.some((mention) => mention.mentioned?.user?.id === me) ?? false)
            if (!isMention) continue
            result.push({
              chatId: chat.id,
              chatName,
              messageId: message.id,
              fromId,
              createdAt: message.createdDateTime,
              isMention: true,
            })
          }
        } catch (error) {
          // One unreadable chat must not hide the mentions the others surfaced.
          console.error('Teams chat skipped:', error instanceof Error ? error.message : String(error))
        }
      }
      return result
    },
  }
}

export function createTeamsSource(
  api: TeamsApi | null,
  meta: SourceMeta = sourceMeta('teams', 'microsoft'),
): Source {
  const connectionId = meta.connectionId
  const syncKey = `last_sync_teams:${connectionId}`
  return {
    ...meta,
    configured: () => api !== null,
    async sync(db: DatabaseSync, now = new Date()) {
      if (!api) return
      const mentions = await api.mentions()
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM teams_mentions WHERE connection_id = ?').run(connectionId)
        const insert = db.prepare(
          `INSERT INTO teams_mentions
             (connection_id, message_id, chat_id, chat_name, from_id, created_at, is_mention)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const mention of mentions) {
          insert.run(
            connectionId,
            mention.messageId,
            mention.chatId,
            mention.chatName,
            mention.fromId,
            mention.createdAt,
            mention.isMention ? 1 : 0,
          )
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      setSetting(db, syncKey, now.toISOString())
    },
    lastSync: (db) => getSetting(db, syncKey),
    digest: (db, _since) => {
      const rows = db
        .prepare(
          `SELECT chat_name, COUNT(*) AS n FROM teams_mentions
           WHERE connection_id = ? GROUP BY chat_name ORDER BY n DESC`,
        )
        .all(connectionId) as Array<{ chat_name: string; n: number }>
      if (rows.length === 0) return []
      const total = rows.reduce((sum, row) => sum + row.n, 0)
      const names = rows
        .slice(0, 5)
        .map((row) => sanitize(row.chat_name, 40))
        .join(', ')
      return [
        `Teams: ${total} ${total === 1 ? 'mention' : 'mentions'} in ${rows.length} ${
          rows.length === 1 ? 'chat' : 'chats'
        } - ${names}`,
      ]
    },
  }
}
