import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { rotateIfNeeded } from '../src/server/log.js'

test('rotates only when the log exceeds the limit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-'))
  const path = join(dir, 'server.log')
  try {
    writeFileSync(path, 'small')
    rotateIfNeeded(path, 100)
    expect(existsSync(`${path}.1`)).toBe(false)

    writeFileSync(path, 'x'.repeat(200))
    rotateIfNeeded(path, 100)
    expect(existsSync(`${path}.1`)).toBe(true)
    expect(existsSync(path)).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
