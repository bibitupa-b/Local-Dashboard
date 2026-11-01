import { expect, test } from 'vitest'
import { createHealth, createSyncState, finishSync, markFailure, markProgress, markSuccess, startSync, updateSyncProgress } from '../src/server/health.js'

test('sync state tracks the active source and its progress', () => {
  const state = createSyncState()
  expect(state.running).toBe(false)

  startSync(state, 'mail', 2, 6)
  expect(state).toMatchObject({ running: true, source: 'mail', sourceIndex: 2, sourceTotal: 6, done: 0, total: 1 })

  updateSyncProgress(state, 3, 7)
  expect(state).toMatchObject({ done: 3, total: 7 })

  finishSync(state)
  expect(state).toMatchObject({ running: false, source: null })
})

test('tracks failures, success and progress per source', () => {
  const health = createHealth(['vault'])
  expect(health.vault).toEqual({ lastError: null, lastErrorAt: null, progress: null })

  markProgress(health, 'vault', 1, 4)
  expect(health.vault!.progress).toEqual({ done: 1, total: 4 })

  markFailure(health, 'vault', new Error('disk gone'), new Date('2026-10-31T10:00:00.000Z'))
  expect(health.vault).toMatchObject({ lastError: 'disk gone', lastErrorAt: '2026-10-31T10:00:00.000Z' })

  markSuccess(health, 'vault')
  expect(health.vault).toEqual({ lastError: null, lastErrorAt: '2026-10-31T10:00:00.000Z', progress: null })
})
