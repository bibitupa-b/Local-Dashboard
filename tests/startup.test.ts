import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startServer } from '../src/server/server.js'

let dataDir: string
let vaultDir: string
let previousVault: string | undefined

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'start-'))
  vaultDir = mkdtempSync(join(tmpdir(), 'vault-empty-'))
  previousVault = process.env.VAULT_PATH
  process.env.VAULT_PATH = vaultDir
})

afterAll(() => {
  if (previousVault === undefined) delete process.env.VAULT_PATH
  else process.env.VAULT_PATH = previousVault
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(vaultDir, { recursive: true, force: true })
})

test('startServer boots, serves the API and closes cleanly', async () => {
  const server = await startServer({ dataDir, port: 0, envFile: null })
  try {
    const response = await server.app.inject({ method: 'GET', url: '/api/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  } finally {
    await server.close()
  }
})

test('briefing hour 0 survives a restart', async () => {
  const { openDb, setSetting } = await import('../src/server/db/index.js')
  const db = openDb(join(dataDir, 'dashboard.db'))
  setSetting(db, 'briefing_hour', '0')
  db.close()

  const server = await startServer({ dataDir, port: 0, envFile: null })
  try {
    const response = await server.app.inject({ method: 'GET', url: '/api/settings' })
    expect(response.json()).toMatchObject({ briefingHour: 0 })
  } finally {
    await server.close()
  }
})

test('close releases the port quickly even during the first sync', async () => {
  const server = await startServer({ dataDir, port: 0, envFile: null })
  const started = Date.now()
  await server.close()
  expect(Date.now() - started).toBeLessThan(5000)
})
