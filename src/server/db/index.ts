import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SCHEMA } from './schema.js'

const SCOPED_TABLES = [
  'vault_files',
  'vault_changes',
  'tasks',
  'mail_folders',
  'mail_messages',
  'drive_files',
  'drive_changes',
  'drive_doc_text',
  'calendar_events',
  'browser_visits',
  'github_items',
]

function exists(db: DatabaseSync, name: string): boolean {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  )
}

function columnNames(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  )
}

/** Rebuilds pre-0.6 tables so every row carries a connection id; legacy rows are scoped later. */
function rebuildForConnections(db: DatabaseSync): void {
  const present = SCOPED_TABLES.filter((table) => exists(db, table))
  if (present.length === 0) return
  if (columnNames(db, 'vault_files').includes('connection_id')) return

  for (const table of present) db.exec(`ALTER TABLE "${table}" RENAME TO "${table}_legacy"`)
  db.exec(SCHEMA)
  for (const table of present) {
    const shared = columnNames(db, `${table}_legacy`).filter((column) => column !== 'connection_id')
    const target = ['connection_id', ...shared].map((column) => `"${column}"`).join(', ')
    const source = shared.map((column) => `"${column}"`).join(', ')
    db.exec(
      `INSERT INTO "${table}" (${target}) SELECT 'legacy', ${source} FROM "${table}_legacy"`,
    )
    db.exec(`DROP TABLE "${table}_legacy"`)
  }
  // Renamed tables keep their indexes; recreate the ones that were dropped with them.
  db.exec(SCHEMA)
}

export function migrate(db: DatabaseSync): void {
  rebuildForConnections(db)
  db.exec(SCHEMA)
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
