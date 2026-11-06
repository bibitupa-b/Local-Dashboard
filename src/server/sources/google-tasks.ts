import type { DatabaseSync } from 'node:sqlite'
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { getSetting, setSetting } from '../db/index.js'
import { sanitize } from '../briefing/digest.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

export type GoogleTask = {
  id: string
  listId: string
  title: string
  due: string | null
  updatedAt: string
}

export type TasksApi = { list(): Promise<GoogleTask[]> }

export function createGoogleTasksSource(
  api: TasksApi | null,
  meta: SourceMeta = sourceMeta('tasks', 'google'),
): Source {
  const connectionId = meta.connectionId
  const syncKey = `last_sync_tasks:${connectionId}`
  return {
    ...meta,
    configured: () => api !== null,
    async sync(db, now = new Date()) {
      if (!api) return
      const tasks = await api.list()
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM google_tasks WHERE connection_id = ?').run(connectionId)
        const insert = db.prepare(
          `INSERT OR IGNORE INTO google_tasks (connection_id, id, list_id, title, due, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        for (const task of tasks) {
          insert.run(
            connectionId,
            task.id,
            task.listId,
            task.title,
            task.due,
            task.updatedAt,
          )
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      setSetting(db, syncKey, now.toISOString())
    },
    lastSync: (db) => getSetting(db, syncKey),
    digest: (db, _since) => {
      const today = new Date().toLocaleDateString('en-CA')
      const rows = db
        .prepare(
          `SELECT title, due FROM google_tasks
           WHERE connection_id = ? AND due IS NOT NULL AND due <= ?
           ORDER BY due ASC LIMIT 5`,
        )
        .all(connectionId, today) as Array<{ title: string; due: string }>
      return rows.map((row) => `${sanitize(row.title, 140)} — due ${row.due}`)
    },
  }
}

export function createGoogleTasksApi(client: OAuth2Client | null): TasksApi | null {
  if (!client) return null
  const tasks = google.tasks({ version: 'v1', auth: client })

  return {
    async list() {
      const result: GoogleTask[] = []
      const lists = await tasks.tasklists.list({ maxResults: 100 })
      for (const list of lists.data.items ?? []) {
        if (!list.id) continue
        const page = await tasks.tasks.list({
          tasklist: list.id,
          showCompleted: false,
          maxResults: 100,
        })
        for (const task of page.data.items ?? []) {
          if (!task.id || !task.title) continue
          result.push({
            id: task.id,
            listId: list.id,
            title: task.title,
            due: task.due ? task.due.slice(0, 10) : null,
            updatedAt: task.updated ?? new Date().toISOString(),
          })
        }
      }
      return result
    },
  }
}
