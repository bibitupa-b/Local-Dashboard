import { expect, test } from 'vitest'
import { createHealth, markFailure, markProgress, markSuccess } from '../src/server/health.js'

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
