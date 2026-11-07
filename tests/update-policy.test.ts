import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { shouldCheckForUpdates } = require('../electron/update-policy.cjs') as {
  shouldCheckForUpdates: (localOnly: boolean, autoUpdate: boolean) => boolean
}

describe('shouldCheckForUpdates', () => {
  test('is true only when not local-only and auto-update is on', () => {
    expect(shouldCheckForUpdates(false, true)).toBe(true)
    expect(shouldCheckForUpdates(false, false)).toBe(false)
    expect(shouldCheckForUpdates(true, true)).toBe(false)
    expect(shouldCheckForUpdates(true, false)).toBe(false)
  })
})
