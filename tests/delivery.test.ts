import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { createSecretBox } from '../src/server/secrets.js'
import { saveConnection } from '../src/server/connections.js'
import { setLocalOnly } from '../src/server/settings.js'
import { deliverBriefing } from '../src/server/delivery.js'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'delivery-'))
}

const briefing = { id: 1, markdown: '# Hello\n\nWorld', body: { headline: 'Hello' } }

test('disabled channels are never called', async () => {
  const dir = tempDir()
  try {
    const box = createSecretBox(dir)
    const db = openDb(':memory:')
    const calls: unknown[] = []
    saveConnection(db, box, { service: 'smtp', label: 'off', config: {}, secret: {}, enabled: false })
    const result = await deliverBriefing(db, box, briefing, 'daily', {
      smtp: async (input) => {
        calls.push(input)
      },
    })
    expect(result).toEqual([])
    expect(calls).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('one failing channel does not stop the other', async () => {
  const dir = tempDir()
  try {
    const box = createSecretBox(dir)
    const db = openDb(':memory:')
    saveConnection(db, box, {
      service: 'smtp',
      label: 'mail',
      config: { host: 's', port: '587', from: 'a@b', to: 'c@d' },
      secret: { user: 'u', password: 'p' },
    })
    saveConnection(db, box, {
      service: 'telegram',
      label: 'tg',
      config: { chatId: '1' },
      secret: { botToken: 't' },
    })
    const result = await deliverBriefing(db, box, briefing, 'daily', {
      smtp: async () => {
        throw new Error('smtp down')
      },
      telegram: async () => {},
    })
    expect(result.map((r) => r.ok)).toEqual([false, true])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('local only sends nothing', async () => {
  const dir = tempDir()
  try {
    const box = createSecretBox(dir)
    const db = openDb(':memory:')
    setLocalOnly(db, true)
    expect(
      await deliverBriefing(db, box, briefing, 'daily', {
        smtp: async () => {
          throw new Error('must not run')
        },
      }),
    ).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
