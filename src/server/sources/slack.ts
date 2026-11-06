import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from '../db/index.js'
import { sanitize } from '../briefing/digest.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

export type SlackMention = {
  channelId: string
  channelName: string
  userId: string
  ts: string
  isDm: boolean
}

export type SlackApi = { mentions(): Promise<SlackMention[]> }

type SlackResponse = {
  ok?: boolean
  error?: string
  user_id?: string
  channels?: Array<{
    id?: string
    name?: string
    is_im?: boolean
    is_mpim?: boolean
  }>
  messages?: Array<{ ts?: string; user?: string; text?: string; subtype?: string }>
}

async function slack(token: string, method: string, params: Record<string, string> = {}): Promise<SlackResponse> {
  const query = new URLSearchParams(params)
  const response = await fetch(`https://slack.com/api/${method}?${query}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await response.json()) as SlackResponse
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error ?? response.status}`)
  return data
}

export function createSlackSource(
  api: SlackApi | null,
  meta: SourceMeta = sourceMeta('slack', 'slack'),
): Source {
  const connectionId = meta.connectionId
  const syncKey = `last_sync_slack:${connectionId}`
  return {
    ...meta,
    configured: () => api !== null,
    async sync(db, now = new Date()) {
      if (!api) return
      const mentions = await api.mentions()
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM slack_mentions WHERE connection_id = ?').run(connectionId)
        const insert = db.prepare(
          `INSERT OR IGNORE INTO slack_mentions
             (connection_id, channel_id, ts, channel_name, user_id, is_dm)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        for (const mention of mentions) {
          insert.run(
            connectionId,
            mention.channelId,
            mention.ts,
            mention.channelName,
            mention.userId,
            mention.isDm ? 1 : 0,
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
        .prepare('SELECT channel_name, is_dm FROM slack_mentions WHERE connection_id = ?')
        .all(connectionId) as Array<{ channel_name: string; is_dm: number }>
      if (rows.length === 0) return []
      const channels = [...new Set(rows.map((row) => `#${sanitize(row.channel_name, 40)}`))]
      return [`Slack: ${rows.length} mentions in ${channels.slice(0, 5).join(', ')}`]
    },
  }
}

/**
 * A user token sees the person's own mentions and DMs; a bot token only sees messages
 * addressed to the bot. `userId` is optional because `auth.test` names the token's owner.
 */
export function createSlackApi(token: string | null, userId?: string | null): SlackApi | null {
  if (!token) return null
  return {
    async mentions() {
      const auth = await slack(token, 'auth.test')
      const self = userId?.trim() || auth.user_id
      if (!self) return []
      const oldest = String(Math.floor((Date.now() - 24 * 3_600_000) / 1000))
      const list = await slack(token, 'conversations.list', {
        types: 'public_channel,private_channel,im,mpim',
        exclude_archived: 'true',
        limit: '200',
      })
      const result: SlackMention[] = []
      for (const channel of list.channels ?? []) {
        if (!channel.id) continue
        const history = await slack(token, 'conversations.history', {
          channel: channel.id,
          oldest,
          limit: '50',
        })
        const isDm = Boolean(channel.is_im || channel.is_mpim)
        for (const message of history.messages ?? []) {
          if (!message.ts || !message.user) continue
          if (message.subtype && message.subtype !== 'thread_broadcast') continue
          if (!isDm && !(message.text ?? '').includes(`<@${self}>`)) continue
          result.push({
            channelId: channel.id,
            channelName: channel.name ?? channel.id,
            userId: message.user,
            ts: message.ts,
            isDm,
          })
        }
      }
      return result
    },
  }
}
