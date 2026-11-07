import { createHash } from 'node:crypto'

export const MICROSOFT_SCOPES = 'offline_access User.Read Calendars.Read Chat.Read'

export type MicrosoftTokens = {
  access_token: string
  refresh_token?: string
  expires_at: number
  scope?: string
  token_type?: string
}

export type MicrosoftCreds = {
  clientId: string
  clientSecret?: string
  tenant?: string
  port: number
  tokens: MicrosoftTokens | null
  onTokens?: (tokens: MicrosoftTokens) => void
  fetcher?: typeof fetch
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function tenantOf(creds: MicrosoftCreds): string {
  return creds.tenant ?? 'common'
}

function redirectUri(creds: MicrosoftCreds): string {
  return `http://127.0.0.1:${creds.port}/api/oauth/microsoft/callback`
}

function tokenUrl(creds: MicrosoftCreds): string {
  return `https://login.microsoftonline.com/${tenantOf(creds)}/oauth2/v2.0/token`
}

function fetcherOf(creds: MicrosoftCreds): typeof fetch {
  return creds.fetcher ?? fetch
}

async function shortBody(res: Response): Promise<string> {
  return (await res.text()).slice(0, 200)
}

export function microsoftAuthUrl(creds: MicrosoftCreds, state: string, verifier: string): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(creds),
    scope: MICROSOFT_SCOPES,
    state,
    code_challenge: base64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  })
  return `https://login.microsoftonline.com/${tenantOf(creds)}/oauth2/v2.0/authorize?${params}`
}

function tokenBody(creds: MicrosoftCreds, grant: Record<string, string>): string {
  const params = new URLSearchParams({ client_id: creds.clientId, ...grant })
  if (creds.clientSecret) params.set('client_secret', creds.clientSecret)
  return params.toString()
}

export async function exchangeMicrosoftCode(
  creds: MicrosoftCreds,
  code: string,
  verifier: string,
): Promise<MicrosoftTokens> {
  const res = await fetcherOf(creds)(tokenUrl(creds), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody(creds, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(creds),
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`Microsoft token exchange failed: ${res.status}`)
  return toTokens(await res.json(), creds.tokens)
}

async function refreshMicrosoftTokens(creds: MicrosoftCreds): Promise<MicrosoftTokens> {
  const refresh_token = creds.tokens?.refresh_token
  if (!refresh_token) throw new Error('Microsoft refresh token missing')
  const res = await fetcherOf(creds)(tokenUrl(creds), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody(creds, {
      grant_type: 'refresh_token',
      refresh_token,
      scope: MICROSOFT_SCOPES,
    }),
  })
  if (!res.ok) throw new Error(`Microsoft token refresh failed: ${res.status}`)
  return toTokens(await res.json(), creds.tokens)
}

function toTokens(json: Record<string, unknown>, previous: MicrosoftTokens | null): MicrosoftTokens {
  return {
    access_token: String(json.access_token),
    refresh_token: json.refresh_token !== undefined ? String(json.refresh_token) : previous?.refresh_token,
    expires_at: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    scope: json.scope !== undefined ? String(json.scope) : previous?.scope,
    token_type: json.token_type !== undefined ? String(json.token_type) : previous?.token_type,
  }
}

export async function microsoftAccessToken(creds: MicrosoftCreds): Promise<string> {
  if (!creds.tokens) throw new Error('Microsoft not configured')
  if (creds.tokens.expires_at > Date.now() + 300_000) return creds.tokens.access_token
  const tokens = await refreshMicrosoftTokens(creds)
  creds.onTokens?.(tokens)
  return tokens.access_token
}

function retryDelayMs(header: string | null): number {
  if (!header) return 0
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(header)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0
}

export async function graph<T>(creds: MicrosoftCreds, path: string): Promise<T> {
  const fetcher = fetcherOf(creds)
  let token = await microsoftAccessToken(creds)

  let res = await graphRequest(fetcher, path, token)
  if (res.status === 401) {
    const refreshed = await refreshMicrosoftTokens(creds)
    creds.onTokens?.(refreshed)
    token = refreshed.access_token
    res = await graphRequest(fetcher, path, token)
  }
  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res.headers.get('Retry-After'))))
    res = await graphRequest(fetcher, path, token)
  }
  if (!res.ok) throw new Error(`Microsoft Graph error: ${res.status} ${await shortBody(res)}`)
  return (await res.json()) as T
}

async function graphRequest(fetcher: typeof fetch, path: string, token: string): Promise<Response> {
  return fetcher(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function hasMicrosoftScope(tokens: MicrosoftTokens | null, scope: string): boolean {
  if (!tokens?.scope) return false
  return tokens.scope.split(/\s+/).includes(scope)
}
