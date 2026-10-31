import { expect, test } from 'vitest'
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

test('settings round-trip', () => {
  const db = openDb(':memory:')
  migrate(db)
  expect(getSetting(db, 'vault_path')).toBeNull()
  setSetting(db, 'vault_path', 'C:/notes')
  setSetting(db, 'vault_path', 'C:/other')
  expect(getSetting(db, 'vault_path')).toBe('C:/other')
})
