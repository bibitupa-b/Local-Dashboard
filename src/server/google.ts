import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
export const GOOGLE_SCOPES = [DRIVE_SCOPE, CALENDAR_SCOPE]

/** Credentials of a single Google connection; tokens are a JSON string stored encrypted. */
export type GoogleCreds = {
  clientId: string
  clientSecret: string
  port: number
  tokens?: string | null
  onTokens?: (tokens: string) => void
}

export function oauthClient(creds: GoogleCreds): OAuth2Client {
  return new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    `http://127.0.0.1:${creds.port}/api/oauth/google/callback`,
  )
}

export function googleAuthUrl(creds: GoogleCreds, state: string): string {
  return oauthClient(creds).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  })
}

export async function exchangeGoogleCode(creds: GoogleCreds, code: string): Promise<string> {
  const { tokens } = await oauthClient(creds).getToken(code)
  return JSON.stringify(tokens)
}

export function authorizedClient(creds: GoogleCreds): OAuth2Client | null {
  if (!creds.tokens) return null
  const client = oauthClient(creds)
  try {
    client.setCredentials(JSON.parse(creds.tokens))
  } catch {
    return null
  }
  client.on('tokens', (fresh) => {
    if (!creds.onTokens) return
    const current = JSON.parse(creds.tokens ?? '{}') as Record<string, unknown>
    creds.onTokens(JSON.stringify({ ...current, ...fresh }))
  })
  return client
}

export function hasScope(tokens: string | null | undefined, scope: string): boolean {
  if (!tokens) return false
  try {
    const parsed = JSON.parse(tokens) as { scope?: string }
    return typeof parsed.scope === 'string' && parsed.scope.split(' ').includes(scope)
  } catch {
    return false
  }
}
