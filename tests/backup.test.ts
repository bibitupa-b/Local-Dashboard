import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { backupDb, pruneBackups } from '../src/server/backup.js'
import { openDb } from '../src/server/db/index.js'

test('creates one backup per day and keeps the newest ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'backup-'))
  try {
    const db = openDb(join(dir, 'dashboard.db'))
    db.exec('CREATE TABLE demo (n INTEGER); INSERT INTO demo VALUES (1)')

    const first = backupDb(db, dir, new Date('2026-10-29T03:00:00Z'), 2)
    expect(first && existsSync(first)).toBe(true)
    backupDb(db, dir, new Date('2026-10-30T03:00:00Z'), 2)
    backupDb(db, dir, new Date('2026-10-31T03:00:00Z'), 2)
    backupDb(db, dir, new Date('2026-10-31T04:00:00Z'), 2)

    const names = readdirSync(join(dir, 'backups')).sort()
    expect(names).toEqual(['dashboard-2026-10-30.db', 'dashboard-2026-10-31.db'])
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('prune ignores unrelated files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prune-'))
  try {
    writeFileSync(join(dir, 'dashboard-2026-01-01.db'), 'x')
    writeFileSync(join(dir, 'dashboard-2026-01-02.db'), 'x')
    writeFileSync(join(dir, 'notes.txt'), 'x')
    expect(pruneBackups(dir, 1)).toEqual(['dashboard-2026-01-01.db'])
    expect(readdirSync(dir).sort()).toEqual(['dashboard-2026-01-02.db', 'notes.txt'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
