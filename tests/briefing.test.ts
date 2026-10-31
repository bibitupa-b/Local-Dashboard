import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { loadConfig } from '../src/server/config.js'
import { createBriefing } from '../src/server/briefing/index.js'
import { BriefingError, generateBriefing } from '../src/server/briefing/deepseek.js'
import { shouldCatchUp } from '../src/server/briefing/schedule.js'

const config = loadConfig({ DEEPSEEK_API_KEY: 'test-key' })

test('401 from DeepSeek surfaces as BriefingError', async () => {
  const fetchFn = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
  await expect(generateBriefing('k', 'digest', fetchFn)).rejects.toMatchObject({ status: 401 })
  await expect(generateBriefing('k', 'digest', fetchFn)).rejects.toBeInstanceOf(BriefingError)
})

test('successful briefing is stored', async () => {
  const db = openDb(':memory:')
  const fetchFn = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '- one\n- two' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

  const result = await createBriefing(db, [], config, { fetchFn, trigger: 'manual' })
  expect(result).toEqual({ markdown: '- one\n- two' })
  const row = db.prepare('SELECT trigger, markdown FROM briefings').get()
  expect(row).toEqual({ trigger: 'manual', markdown: '- one\n- two' })
})

test('missing key refuses without calling the API', async () => {
  let called = false
  const fetchFn = (async () => {
    called = true
    return new Response('{}')
  }) as unknown as typeof fetch
  const result = await createBriefing(openDb(':memory:'), [], loadConfig({}), { fetchFn })
  expect(result).toEqual({ error: 'no-key' })
  expect(called).toBe(false)
})

test('catch-up decision', () => {
  const now = new Date('2026-10-31T09:00:00')
  expect(shouldCatchUp(null, now, 8)).toBe(true)
  expect(shouldCatchUp(new Date('2026-10-31T00:10:00'), now, 8)).toBe(false)
  expect(shouldCatchUp(new Date('2026-10-30T08:00:00'), new Date('2026-10-31T07:59:00'), 8)).toBe(false)
  expect(shouldCatchUp(new Date('2026-10-30T08:00:00'), now, 8)).toBe(true)
})
