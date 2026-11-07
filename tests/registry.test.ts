import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { loadConfig } from '../src/server/config.js'
import { createSecretBox } from '../src/server/secrets.js'
import { saveConnection } from '../src/server/connections.js'
import { buildSources } from '../src/server/registry.js'

test('builds one source per connection, google yields drive and calendar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'registry-'))
  try {
    const db = openDb(':memory:')
    const box = createSecretBox(dir)
    const config = loadConfig({ VAULT_PATH: 'C:/notes' })

    saveConnection(db, box, { service: 'vault', label: 'Main', config: { path: 'C:/notes' } })
    saveConnection(db, box, { service: 'vault', label: 'Work', config: { path: 'C:/work' } })
    saveConnection(db, box, {
      service: 'imap',
      label: 'Gmail',
      config: { user: 'me@example.com' },
      secret: { password: 'x' },
    })
    saveConnection(db, box, { service: 'github', label: 'GH', config: {}, secret: { token: 't' } })
    saveConnection(db, box, { service: 'browser', label: 'Helium', config: {} })
    saveConnection(db, box, {
      service: 'google',
      label: 'Google',
      config: { clientId: 'id' },
      secret: {
        clientSecret: 'secret',
        tokens: JSON.stringify({
          scope:
            'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.readonly',
        }),
      },
    })
    saveConnection(db, box, {
      service: 'caldav',
      label: 'iCloud',
      config: { preset: 'iCloud', url: 'https://caldav.icloud.com', username: 'me@icloud.com' },
      secret: { password: 'x' },
    })

    const sources = buildSources({ db, box, config, dataDir: dir })
    const kinds = sources.map((source) => source.kind).sort()
    expect(kinds).toEqual([
      'browser',
      'calendar',
      'calendar',
      'drive',
      'github',
      'mail',
      'tasks',
      'vault',
      'vault',
    ])
    expect(new Set(sources.map((source) => source.id)).size).toBe(sources.length)
    expect(sources.find((source) => source.kind === 'drive')?.configured()).toBe(true)
    expect(sources.filter((source) => source.kind === 'calendar')).toHaveLength(2)
    expect(sources.find((source) => source.kind === 'calendar')?.configured()).toBe(true)
    // The test token was granted before the Tasks scope existed.
    expect(sources.find((source) => source.kind === 'tasks')?.configured()).toBe(false)

    const disabled = saveConnection(db, box, {
      service: 'github',
      label: 'off',
      config: {},
      secret: { token: 't' },
      enabled: false,
    })
    expect(disabled.enabled).toBe(false)
    expect(buildSources({ db, box, config, dataDir: dir })).toHaveLength(9)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
