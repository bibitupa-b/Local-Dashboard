import { existsSync } from 'node:fs'
import { ImapFlow } from 'imapflow'
import { hasScope, DRIVE_SCOPE, CALENDAR_SCOPE } from './google.js'
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
        try {
          await client.connect()
          return { ok: true }
        } finally {
          await client.logout().catch(() => {})
        }
      }
      case 'google': {
        const tokens = connection.secret?.tokens
        if (!tokens) return { ok: false, error: 'Google account is not connected yet' }
        if (!hasScope(tokens, DRIVE_SCOPE) && !hasScope(tokens, CALENDAR_SCOPE)) {
          return { ok: false, error: 'Token has no Drive or Calendar scope' }
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
