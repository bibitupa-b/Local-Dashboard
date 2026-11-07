import { existsSync } from 'node:fs'
import { ImapFlow } from 'imapflow'
import { createDAVClient } from 'tsdav'
import nodemailer from 'nodemailer'
import { hasScope, DRIVE_SCOPE, CALENDAR_SCOPE, TASKS_SCOPE } from './google.js'
import { graph, hasMicrosoftScope, type MicrosoftCreds, type MicrosoftTokens } from './microsoft.js'
import type { Connection } from './connections.js'

export type TestResult = { ok: boolean; error?: string }

function microsoftTokens(connection: Connection): MicrosoftTokens | null {
  const raw = connection.secret?.tokens
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MicrosoftTokens
    return typeof parsed?.access_token === 'string' ? parsed : null
  } catch {
    return null
  }
}

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
      case 'caldav': {
        const url = connection.config.url
        const username = connection.config.username
        const password = connection.secret?.password
        if (!url || !username || !password) {
          return { ok: false, error: 'Server URL, username and password are required' }
        }
        const client = await createDAVClient({
          serverUrl: url,
          credentials: { username, password },
          authMethod: 'Basic',
          defaultAccountType: 'caldav',
        })
        await client.fetchCalendars()
        return { ok: true }
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
      case 'microsoft': {
        const tokens = microsoftTokens(connection)
        if (!tokens) return { ok: false, error: 'Microsoft account is not connected yet' }
        const creds: MicrosoftCreds = {
          clientId: connection.config.clientId ?? '',
          clientSecret: connection.secret?.clientSecret,
          tenant: connection.config.tenant?.trim() || 'common',
          port: 4317, // /me does not use the port; only the authorize/token URL does
          tokens,
        }
        await graph<{ userPrincipalName?: string }>(creds, '/me?$select=userPrincipalName')
        if (!hasMicrosoftScope(tokens, 'Chat.Read')) {
          return {
            ok: true,
            error: 'Calendar is connected; Teams is skipped - add the Chat.Read scope and reconnect.',
          }
        }
        return { ok: true }
      }
      case 'smtp': {
        const host = connection.config.host
        const port = Number(connection.config.port)
        const user = connection.secret?.user
        const password = connection.secret?.password
        if (!host || !Number.isFinite(port) || port <= 0) {
          return { ok: false, error: 'Host and port are required' }
        }
        if (!user || !password) return { ok: false, error: 'SMTP username and password are required' }
        const secure = port === 465
        const transport = nodemailer.createTransport({
          host,
          port,
          secure,
          // Non-465 ports must upgrade with STARTTLS; never fall back to plaintext.
          requireTLS: !secure,
          auth: { user, pass: password },
        })
        await transport.verify()
        return { ok: true }
      }
      case 'telegram': {
        const token = connection.secret?.botToken
        if (!token) return { ok: false, error: 'Bot token is missing' }
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
        const data = (await res.json()) as { ok?: boolean; description?: string }
        return data.ok
          ? { ok: true }
          : { ok: false, error: `Telegram responded ${data.description ?? res.status}` }
      }
      default:
        return { ok: false, error: 'Unknown service' }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
