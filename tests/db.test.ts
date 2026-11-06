import { expect, test } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { getSetting, migrate, openDb, setSetting } from '../src/server/db/index.js'

test('migrate is idempotent and creates all tables', () => {
  const db = openDb(':memory:')
  migrate(db)
  migrate(db)
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name)
  expect(names).toEqual(
    expect.arrayContaining([
      'briefings',
      'drive_changes',
      'drive_files',
      'settings',
      'tasks',
      'vault_changes',
      'vault_files',
    ]),
  )
})

test('migrate adds the briefing columns to an old table and keeps rows', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE briefings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    trigger TEXT NOT NULL,
    markdown TEXT NOT NULL,
    digest_meta TEXT NOT NULL DEFAULT '{}'
  )`)
  db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown) VALUES ('2026-10-31T08:00:00.000Z', 'auto', 'old bullet')`,
  ).run()

  migrate(db)

  const names = (db.prepare("PRAGMA table_info('briefings')").all() as Array<{ name: string }>).map(
    (column) => column.name,
  )
  expect(names).toEqual(expect.arrayContaining(['body', 'digest', 'feedback', 'kind']))
  expect(db.prepare('SELECT markdown, digest, kind FROM briefings').get()).toEqual({
    markdown: 'old bullet',
    digest: '',
    kind: 'daily',
  })
})

test('settings round-trip', () => {
  const db = openDb(':memory:')
  migrate(db)
  expect(getSetting(db, 'vault_path')).toBeNull()
  setSetting(db, 'vault_path', 'C:/notes')
  setSetting(db, 'vault_path', 'C:/other')
  expect(getSetting(db, 'vault_path')).toBe('C:/other')
})
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('a file database uses WAL and a busy timeout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'db-pragma-'))
  const db = openDb(join(dir, 'dashboard.db'))
  expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
  expect(db.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 })
  db.close()
  await rm(dir, { recursive: true, force: true })
})
