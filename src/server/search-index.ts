import type { DatabaseSync } from 'node:sqlite'

/**
 * One FTS5 table over the three searchable shapes. Rebuilt after a sync rather than maintained
 * with triggers: the source tables are small and a full rebuild keeps the index honest.
 */
export function rebuildSearchIndex(db: DatabaseSync): void {
  db.exec('BEGIN')
  try {
    db.exec('DELETE FROM search_fts')
    const insert = db.prepare(
      `INSERT INTO search_fts (source, ref, title, body, date, meta) VALUES (?, ?, ?, ?, ?, ?)`,
    )

    for (const row of db
      .prepare('SELECT path, mtime, previous_text FROM vault_files')
      .all() as Array<{ path: string; mtime: string; previous_text: string }>) {
      insert.run('note', row.path, row.path, row.previous_text, row.mtime, '{}')
    }

    for (const row of db
      .prepare(
        `SELECT COALESCE(message_id, folder || ':' || uid) AS ref, subject, snippet, date, sender, message_id, folder
         FROM mail_messages`,
      )
      .all() as Array<{
      ref: string
      subject: string
      snippet: string
      date: string
      sender: string
      message_id: string | null
      folder: string
    }>) {
      insert.run(
        'mail',
        row.ref,
        row.subject,
        row.snippet,
        row.date,
        JSON.stringify({
          sender: row.sender,
          messageId: row.message_id,
          folder: row.folder,
        }),
      )
    }

    for (const row of db
      .prepare(
        `SELECT f.id, f.name, f.modified_time AS modifiedTime, COALESCE(d.text, '') AS text
         FROM drive_files f
         LEFT JOIN drive_doc_text d ON d.connection_id = f.connection_id AND d.file_id = f.id`,
      )
      .all() as Array<{ id: string; name: string; modifiedTime: string; text: string }>) {
      insert.run('drive', row.id, row.name, row.text, row.modifiedTime, '{}')
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function hasSearchIndex(db: DatabaseSync): boolean {
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM search_fts').get() as { n: number }).n > 0
  } catch {
    return false
  }
}

/** FTS5 treats punctuation as syntax; quote every token so a note title cannot break the query. */
export function searchMatch(term: string): string {
  return term
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '""').trim())
    .filter(Boolean)
    .map((token) => `"${token}"`)
    .join(' AND ')
}
