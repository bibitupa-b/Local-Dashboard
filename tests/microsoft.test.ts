import { expect, test } from 'vitest'
import {
  exchangeMicrosoftCode,
  graph,
  hasMicrosoftScope,
  microsoftAccessToken,
  microsoftAuthUrl,
  type MicrosoftCreds,
  type MicrosoftTokens,
} from '../src/server/microsoft.js'

const creds: MicrosoftCreds = {
  clientId: 'client-id',
  port: 4317,
  tokens: null,
}

test('auth URL carries the read scopes and loopback redirect', () => {
  const url = microsoftAuthUrl(creds, 'state', 'verifier')
  expect(url).toContain('Calendars.Read')
  expect(url).toContain('Chat.Read')
  expect(url).toContain('redirect_uri=http%3A%2F%2F127.0.0.1%3A4317%2Fapi%2Foauth%2Fmicrosoft%2Fcallback')
})

test('expired tokens refresh once and persist', async () => {
  const saved: MicrosoftTokens[] = []
  const fetcher = async () => new Response(JSON.stringify({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 }), { status: 200 })
  const token = await microsoftAccessToken({ ...creds, tokens: { access_token: 'old', refresh_token: 'r1', expires_at: 0 }, onTokens: (t) => saved.push(t), fetcher })
  expect(token).toBe('new')
  expect(saved[0]!.access_token).toBe('new')
})

test('missing Chat.Read leaves calendar scope usable', () => {
  expect(hasMicrosoftScope({ access_token: 'a', expires_at: 0, scope: 'Calendars.Read' }, 'Chat.Read')).toBe(false)
  expect(hasMicrosoftScope({ access_token: 'a', expires_at: 0, scope: 'Calendars.Read Chat.Read' }, 'Chat.Read')).toBe(true)
})

test('fresh tokens are returned without a network call', async () => {
  let calls = 0
  const fetcher = async () => {
    calls++
    return new Response(JSON.stringify({}), { status: 200 })
  }
  const token = await microsoftAccessToken({
    ...creds,
    tokens: { access_token: 'fresh', refresh_token: 'r1', expires_at: Date.now() + 999_999 },
    fetcher,
  })
  expect(token).toBe('fresh')
  expect(calls).toBe(0)
})

test('microsoftAccessToken updates creds.tokens in place after refresh', async () => {
  const fetcher = async () => new Response(JSON.stringify({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 }), { status: 200 })
  const myCreds: MicrosoftCreds = {
    ...creds,
    tokens: { access_token: 'old', refresh_token: 'r1', expires_at: 0 },
    fetcher,
  }
  await microsoftAccessToken(myCreds)
  expect(myCreds.tokens?.access_token).toBe('new')
  expect(myCreds.tokens?.refresh_token).toBe('r2')
})

test('graph 401 retry uses the rotated refresh token', async () => {
  const refreshTokensSent: string[] = []
  let graphCalls = 0
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/token')) {
      const body = new URLSearchParams(init?.body as string)
      refreshTokensSent.push(body.get('refresh_token') ?? '')
      return new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600 }), { status: 200 })
    }
    graphCalls++
    if (graphCalls === 1) return new Response('unauthorized', { status: 401 })
    return new Response(JSON.stringify({ value: [{ id: 'e1' }] }), { status: 200 })
  }
  const result = await graph<{ value: Array<{ id: string }> }>(
    { ...creds, tokens: { access_token: 'stale', refresh_token: 'r1', expires_at: 0 }, fetcher },
    '/me/events',
  )
  expect(result.value[0]!.id).toBe('e1')
  expect(refreshTokensSent).toEqual(['r1', 'r2'])
})

test('exchangeMicrosoftCode posts the PKCE verifier and returns tokens', async () => {
  let body: URLSearchParams | undefined
  const fetcher: typeof fetch = async (_input, init) => {
    body = new URLSearchParams(init?.body as string)
    return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'User.Read' }), { status: 200 })
  }
  const tokens = await exchangeMicrosoftCode({ ...creds, fetcher }, 'code', 'verifier')
  expect(tokens.access_token).toBe('at')
  expect(tokens.refresh_token).toBe('rt')
  expect(tokens.expires_at).toBeGreaterThan(Date.now())
  expect(body?.get('code_verifier')).toBe('verifier')
  expect(body?.get('code')).toBe('code')
  expect(body?.get('grant_type')).toBe('authorization_code')
})

test('graph refreshes once on 401 and retries', async () => {
  const saved: MicrosoftTokens[] = []
  let graphCalls = 0
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('/token')) {
      return new Response(JSON.stringify({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600 }), { status: 200 })
    }
    graphCalls++
    if (graphCalls === 1) return new Response('unauthorized', { status: 401 })
    return new Response(JSON.stringify({ value: [{ id: 'e1' }] }), { status: 200 })
  }
  const result = await graph<{ value: Array<{ id: string }> }>(
    {
      ...creds,
      tokens: { access_token: 'stale', refresh_token: 'r1', expires_at: Date.now() + 999_999 },
      onTokens: (t) => saved.push(t),
      fetcher,
    },
    '/me/events',
  )
  expect(result.value[0]!.id).toBe('e1')
  expect(graphCalls).toBe(2)
  expect(saved[0]!.access_token).toBe('fresh')
})

test('graph honours Retry-After once on 429', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls++
    if (calls === 1) return new Response('slow down', { status: 429, headers: { 'Retry-After': '0' } })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  const result = await graph<{ ok: boolean }>(
    { ...creds, tokens: { access_token: 'a', refresh_token: 'r', expires_at: Date.now() + 999_999 }, fetcher },
    '/me',
  )
  expect(result).toEqual({ ok: true })
  expect(calls).toBe(2)
})
