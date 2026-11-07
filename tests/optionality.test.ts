import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildSources } from '../src/server/registry.js'
import { isLocalOnly, setLocalOnly } from '../src/server/settings.js'
import { sourceMeta } from '../src/server/sources/types.js'
import { createBriefing } from '../src/server/briefing/index.js'
import { saveConnection } from '../src/server/connections.js'

test('vault and browser are local, network sources are not', () => {
  expect(sourceMeta('vault', 'vault').network).toBe(false)
  expect(sourceMeta('browser', 'browser').network).toBe(false)
  expect(sourceMeta('github', 'github').network).toBe(true)
  expect(sourceMeta('calendar', 'caldav').network).toBe(true)
})

test('local only builds no network sources', () => {
  const db = openDb(':memory:')
  const box = { encrypt: (value: string) => value, decrypt: (value: string) => value }
  saveConnection(db, box, { service: 'vault', label: 'v', config: { path: 'C:/notes' } })
  saveConnection(db, box, { service: 'browser', label: 'b', config: { path: '' } })
  saveConnection(db, box, { service: 'github', label: 'g', config: {}, secret: { token: 't' } })
  setLocalOnly(db, true)
  const kinds = buildSources({ db, box, config: {} as never, dataDir: '' }).map((s) => s.kind)
  expect(kinds.sort()).toEqual(['browser', 'vault'])
})

test('local only forces the rules briefing even with a key', async () => {
  const db = openDb(':memory:')
  setLocalOnly(db, true)
  const result = await createBriefing(db, [], { deepseekKey: 'key' } as never, { trigger: 'manual' })
  expect('digestMeta' in result && result.digestMeta.model).toBe('rules')
  expect(isLocalOnly(db)).toBe(true)
})
