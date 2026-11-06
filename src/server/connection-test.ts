import { existsSync } from 'node:fs'
import { ImapFlow } from 'imapflow'
import { hasScope, DRIVE_SCOPE, CALENDAR_SCOPE, TASKS_SCOPE } from './google.js'
import type { Connection } from './connections.js'

export type TestResult = { ok: boolean; error?: string }

export async function testConnection(connection: Connection): Promise<TestResult> {
  try {
    switch (connection.service) {
      case 'vault': {
        const path = connection.config.path
        if (!path) return { ok: false, error: 'Vault path is empty' }
        return existsSync(path)
          ? { ok: true }
          : { ok: false, error: `Folder not found: ${path}` }
      }
      case 'browser': {
        const path = connection.config.path
        if (!path) return { ok: true }
        return existsSync(path)
          ? { ok: true }
          : { ok: false, error: `History file not found: ${path}` }
      }
      case 'github': {
        const token = connection.secret?.token
        if (!token) return { ok: false, error: 'Token is missing' }
        const res = await fetch('https://api.github.com/user', {
          headers: { authorization: `Bearer ${token}`, 'user-agent': 'local-dashboard' },
        })
        return res.ok ? { ok: true } : { ok: false, error: `GitHub responded ${res.status}` }
      }
      case 'imap': {
        const user = connection.config.user
        const password = connection.secret?.password
        if (!user || !password) return { ok: false, error: 'Email or app password is missing' }
        const client = new ImapFlow({
          host: 'imap.gmail.com',
          port: 993,
          secure: true,
          auth: { user, pass: password },
          logger: false,
        })
        client.on('error', () => {})
        let timer: NodeJS.Timeout | undefined
        try {
          await Promise.race([
            client.connect(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('IMAP connection timed out')), 15_000)
            }),
          ])
          return { ok: true }
        } finally {
          if (timer) clearTimeout(timer)
          await client.logout().catch(() => {})
        }
      }
      case 'weather': {
        const latitude = Number(connection.config.latitude)
        const longitude = Number(connection.config.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return { ok: false, error: 'Latitude and longitude are required' }
        }
        if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          return { ok: false, error: 'Coordinates are out of range' }
        }
        return { ok: true }
      }
      case 'rss': {
        const feeds = (connection.config.feeds ?? '')
          .split(/[\n,]+/)
          .map((feed) => feed.trim())
          .filter(Boolean)
        return feeds.length > 0
          ? { ok: true }
          : { ok: false, error: 'Add at least one RSS or Atom URL' }
      }
      case 'slack': {
        const token = connection.secret?.token
        if (!token) return { ok: false, error: 'Slack token is missing' }
        const response = await fetch('https://slack.com/api/auth.test', {
          headers: { authorization: `Bearer ${token}` },
        })
        const data = (await response.json()) as { ok?: boolean; error?: string }
        return data.ok
          ? { ok: true }
          : { ok: false, error: `Slack responded ${data.error ?? response.status}` }
      }
      case 'deepseek': {
        const key = connection.secret?.key
        if (!key) return { ok: false, error: 'API key is missing' }
        const res = await fetch('https://api.deepseek.com/models', {
          headers: { authorization: `Bearer ${key}` },
        })
        return res.ok ? { ok: true } : { ok: false, error: `DeepSeek responded ${res.status}` }
      }
      case 'google': {
        const tokens = connection.secret?.tokens
        if (!tokens) return { ok: false, error: 'Google account is not connected yet' }
        if (
          !hasScope(tokens, DRIVE_SCOPE) &&
          !hasScope(tokens, CALENDAR_SCOPE) &&
          !hasScope(tokens, TASKS_SCOPE)
        ) {
          return { ok: false, error: 'Token has no Drive, Calendar or Tasks scope' }
        }
        return { ok: true }
      }
      default:
        return { ok: false, error: 'Unknown service' }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
