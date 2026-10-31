import { expect, test } from 'vitest'
import { buildApp } from '../src/server/app.js'
import { loadConfig } from '../src/server/config.js'
import { openDb } from '../src/server/db/index.js'

test('health responds ok', async () => {
  const db = openDb(':memory:')
  const app = buildApp({ db, config: loadConfig({}) })
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ ok: true })
  await app.close()
})
