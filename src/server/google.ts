import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { google } from 'googleapis'
import type { Config } from './config.js'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const GOOGLE_SCOPES = [DRIVE_SCOPE, CALENDAR_SCOPE]

function tokenPath(config: Config): string {
  return join(config.dataDir, 'google-token.json')
}

export function oauthClient(config: Config): InstanceType<typeof google.auth.OAuth2> | null {
  if (!config.googleClientId || !config.googleClientSecret) return null
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    `http://127.0.0.1:${config.port}/api/oauth/google/callback`,
  )
}

export function googleAuthUrl(config: Config, state: string): string | null {
  const client = oauthClient(config)
  if (!client) return null
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  })
}

export async function saveGoogleCode(config: Config, code: string): Promise<void> {
  const client = oauthClient(config)
  if (!client) throw new Error('Google credentials are not configured')
  const { tokens } = await client.getToken(code)
  await writeFile(tokenPath(config), JSON.stringify(tokens, null, 2), 'utf8')
}

export async function authorizedClient(config: Config) {
  const client = oauthClient(config)
  if (!client) return null
  let tokens
  try {
    tokens = JSON.parse(await readFile(tokenPath(config), 'utf8'))
  } catch {
    return null
  }
  client.setCredentials(tokens)
  client.on('tokens', (fresh) => {
    void writeFile(tokenPath(config), JSON.stringify({ ...tokens, ...fresh }, null, 2), 'utf8')
  })
  return client
}

export async function hasScope(config: Config, scope: string): Promise<boolean> {
  try {
    const tokens = JSON.parse(await readFile(tokenPath(config), 'utf8')) as { scope?: string }
    return typeof tokens.scope === 'string' && tokens.scope.split(' ').includes(scope)
  } catch {
    return false
  }
}
