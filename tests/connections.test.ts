import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { loadConfig } from '../src/server/config.js'
import { createSecretBox } from '../src/server/secrets.js'
import {
  deleteConnection,
  getConnection,
  importConnectionsFromEnv,
  listConnections,
  resolveDeepseekKey,
  saveConnection,
} from '../src/server/connections.js'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'connections-'))
}

test('secrets round-trip and fail with another key', () => {
  const first = tempDir()
  const second = tempDir()
  try {
    const box = createSecretBox(first)
    const payload = box.encrypt('{"password":"hunter2"}')
    expect(box.decrypt(payload)).toBe('{"password":"hunter2"}')
    expect(() => createSecretBox(second).decrypt(payload)).toThrow()
  } finally {
    rmSync(first, { recursive: true, force: true })
    rmSync(second, { recursive: true, force: true })
  }
})

test('connections are stored encrypted and can be updated or removed', () => {
  const dir = tempDir()
  try {
    const box = createSecretBox(dir)
    const db = openDb(':memory:')

    const created = saveConnection(db, box, {
      service: 'imap',
      label: 'Work Gmail',
      config: { user: 'me@example.com' },
      secret: { password: 'app-password' },
    })
    expect(created.id).toMatch(/^imap-/)
    expect(created.secret).toEqual({ password: 'app-password' })
    expect(listConnections(db, box)).toHaveLength(1)

    const updated = saveConnection(db, box, {
      id: created.id,
      service: 'imap',
      label: 'Personal',
      config: { user: 'other@example.com' },
      enabled: false,
    })
    expect(updated).toMatchObject({ label: 'Personal', enabled: false })
    expect(updated.secret).toEqual({ password: 'app-password' })

    deleteConnection(db, created.id)
    expect(getConnection(db, box, created.id)).toBeNull()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('deepseek key prefers the connection over the environment', () => {
  const dir = tempDir()
  try {
    const box = createSecretBox(dir)
    const db = openDb(':memory:')
    expect(resolveDeepseekKey(db, box, 'env-key')).toBe('env-key')

    const connection = saveConnection(db, box, {
      service: 'deepseek',
      label: 'DeepSeek',
      config: {},
      secret: { key: 'db-key' },
    })
    expect(resolveDeepseekKey(db, box, 'env-key')).toBe('db-key')

    saveConnection(db, box, {
      id: connection.id,
      service: 'deepseek',
      label: 'DeepSeek',
      config: {},
      enabled: false,
    })
    expect(resolveDeepseekKey(db, box, 'env-key')).toBe('env-key')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('env credentials become connections once', () => {
  const dir = tempDir()
  try {
    writeFileSync(join(dir, 'google-token.json'), JSON.stringify({ refresh_token: 'r' }))
    const box = createSecretBox(dir)
    const db = openDb(':memory:')
    const config = loadConfig({
      VAULT_PATH: 'C:/notes',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GMAIL_USER: 'me@example.com',
      GMAIL_APP_PASSWORD: 'pass',
      GITHUB_TOKEN: 'gh',
    })

    importConnectionsFromEnv(db, box, config, dir)
    const rows = listConnections(db, box)
    expect(rows.map((row) => row.service).sort()).toEqual(['browser', 'github', 'google', 'imap', 'vault'])
    const google = rows.find((row) => row.service === 'google')!
    expect(google.config.clientId).toBe('id')
    expect(google.secret?.tokens).toContain('refresh_token')
    const imap = rows.find((row) => row.service === 'imap')!
    expect(imap.secret).toEqual({ password: 'pass' })

    importConnectionsFromEnv(db, box, config, dir)
    expect(listConnections(db, box)).toHaveLength(5)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
