import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { buildApp } from '../src/server/app.js'
import { loadConfig } from '../src/server/config.js'
import { openDb } from '../src/server/db/index.js'
import { createDriveSource } from '../src/server/sources/drive.js'
import { createVaultSource } from '../src/server/sources/vault/index.js'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'api-'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

function harness(apiKey?: string) {
  const db = openDb(':memory:')
  const config = loadConfig(apiKey ? { DEEPSEEK_API_KEY: apiKey, VAULT_PATH: root } : { VAULT_PATH: root })
  const sources = [createVaultSource(root), createDriveSource(null)]
  const app = buildApp({ db, config, sources, webRoot: join(root, 'no-ui') })
  return { app, db }
}

test('status reports configured sources and no briefing yet', async () => {
  const { app } = harness()
  const res = await app.inject({ method: 'GET', url: '/api/status' })
  expect(res.statusCode).toBe(200)
  expect(res.json().sources).toEqual([
    { id: 'vault', configured: true, lastSync: null },
    { id: 'drive', configured: false, lastSync: null },
  ])
  expect(res.json().briefingToday).toBe(false)
  await app.close()
})

test('feed groups entries by day, newest first', async () => {
  const { app, db } = harness()
  const insert = db.prepare(
    `INSERT INTO vault_changes (path, detected_at, added, removed, diff, text) VALUES (?, ?, 1, 0, '', '')`,
  )
  insert.run('today.md', '2026-10-31T10:00:00.000Z')
  insert.run('yesterday.md', '2026-10-30T10:00:00.000Z')

  const res = await app.inject({ method: 'GET', url: '/api/feed?days=3650' })
  const days = res.json().days as Array<{ date: string; items: Array<{ label: string }> }>
  expect(days.map((day) => day.date)).toEqual(['2026-10-31', '2026-10-30'])
  expect(days[0]!.items[0]!.label).toBe('today.md')
  await app.close()
})

test('generating without a key returns 400', async () => {
  const { app } = harness()
  const res = await app.inject({ method: 'POST', url: '/api/briefings/generate' })
  expect(res.statusCode).toBe(400)
  expect(res.json()).toEqual({ error: 'no-key' })
  await app.close()
})

test('unknown api route returns json 404', async () => {
  const { app } = harness()
  const res = await app.inject({ method: 'GET', url: '/api/nope' })
  expect(res.statusCode).toBe(404)
  expect(res.json()).toEqual({ error: 'not found' })
  await app.close()
})
