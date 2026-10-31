import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')

export function migrate(db: DatabaseSync): void {
  // tasks is derived data; early builds had a UNIQUE(path, text) that collapsed repeats.
  const columns = db.prepare("PRAGMA table_info('tasks')").all() as Array<{ name: string }>
  if (columns.length > 0 && !columns.some((column) => column.name === 'occurrence')) {
    db.exec('DROP TABLE tasks')
  }
  db.exec(schema)
  const mailColumns = db.prepare("PRAGMA table_info('mail_messages')").all() as Array<{ name: string }>
  if (mailColumns.length > 0 && !mailColumns.some((column) => column.name === 'bulk')) {
    db.exec('ALTER TABLE mail_messages ADD COLUMN bulk INTEGER NOT NULL DEFAULT 0')
  }
}

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  migrate(db)
  return db
}

export function getSetting(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}
