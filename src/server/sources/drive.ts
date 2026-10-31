import { google } from 'googleapis'
import { getSetting, setSetting } from '../db/index.js'
import { authorizedClient } from '../google.js'
import type { Source } from './types.js'
import type { Config } from '../config.js'

export type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string }
export type DriveApi = {
  listSince(cursor: string | null): Promise<{ files: DriveFile[]; nextCursor: string | null }>
}

export function createDriveSource(api: DriveApi | null): Source {
  return {
    id: 'drive',
    configured: () => api !== null,
    async sync(db, now = new Date()) {
      if (!api) return
      const cursor = getSetting(db, 'drive_cursor')
      const { files, nextCursor } = await api.listSince(cursor)

      const upsert = db.prepare(
        `INSERT INTO drive_files (id, name, mime_type, modified_time, parents) VALUES (?, ?, ?, ?, '[]')
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, mime_type = excluded.mime_type,
           modified_time = excluded.modified_time`,
      )
      const record = db.prepare(
        `INSERT INTO drive_changes (file_id, kind, detected_at) VALUES (?, ?, ?)`,
      )
      const find = db.prepare('SELECT modified_time FROM drive_files WHERE id = ?')
      const nowIso = now.toISOString()

      for (const file of files) {
        const existing = find.get(file.id) as { modified_time: string } | undefined
        if (cursor !== null) {
          if (!existing) record.run(file.id, 'added', nowIso)
          else if (file.modifiedTime > existing.modified_time) record.run(file.id, 'modified', nowIso)
        }
        upsert.run(file.id, file.name, file.mimeType, file.modifiedTime)
      }

      setSetting(db, 'drive_cursor', nextCursor ?? cursor ?? nowIso)
      setSetting(db, 'last_sync_drive', nowIso)
    },
    lastSync: (db) =>
      (db.prepare("SELECT value FROM settings WHERE key = 'last_sync_drive'").get() as
        | { value: string }
        | undefined)?.value ?? null,
    digest: (db, since) =>
      db
        .prepare(
          `SELECT COALESCE(f.name, c.file_id) AS name, c.kind FROM drive_changes c
           LEFT JOIN drive_files f ON f.id = c.file_id
           WHERE c.detected_at >= ? ORDER BY c.detected_at DESC`,
        )
        .all(since.toISOString())
        .map((row) => {
          const { name, kind } = row as { name: string; kind: string }
          return `${name} (${kind})`
        }),
  }
}

export async function createGoogleDriveApi(config: Config): Promise<DriveApi | null> {
  const client = await authorizedClient(config)
  if (!client) return null
  const drive = google.drive({ version: 'v3', auth: client })

  return {
    async listSince(cursor) {
      const files: DriveFile[] = []
      let pageToken: string | undefined
      let nextCursor = cursor
      do {
        const res = await drive.files.list({
          q: cursor ? `trashed = false and modifiedTime > '${cursor}'` : 'trashed = false',
          orderBy: 'modifiedTime desc',
          pageSize: 100,
          pageToken,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
        })
        for (const file of res.data.files ?? []) {
          if (!file.id || !file.name || !file.modifiedTime) continue
          files.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType ?? 'application/octet-stream',
            modifiedTime: file.modifiedTime,
          })
          if (!nextCursor || file.modifiedTime > nextCursor) nextCursor = file.modifiedTime
        }
        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
      return { files, nextCursor: nextCursor ?? null }
    },
  }
}

export { googleAuthUrl, saveGoogleCode } from '../google.js'
