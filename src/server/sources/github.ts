import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from '../db/index.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

export type GithubItem = {
  id: string
  kind: 'notification' | 'review'
  repo: string
  title: string
  url: string
  updatedAt: string
}

export type GithubApi = { items(): Promise<GithubItem[]> }

export function createGithubSource(api: GithubApi | null, meta: SourceMeta = sourceMeta('github', 'github')): Source {
  const connectionId = meta.connectionId
  const syncKey = `last_sync_github:${connectionId}`
  return {
    ...meta,
    configured: () => api !== null,
    async sync(db, now = new Date()) {
      if (!api) return
      const items = await api.items()

      const insert = db.prepare(
        `INSERT INTO github_items (connection_id, id, kind, repo, title, url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(connection_id, id) DO UPDATE SET kind = excluded.kind, repo = excluded.repo,
           title = excluded.title, url = excluded.url, updated_at = excluded.updated_at`,
      )
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM github_items WHERE connection_id = ?').run(connectionId)
        for (const item of items) {
          insert.run(
            connectionId,
            item.id,
            item.kind,
            item.repo,
            item.title,
            item.url,
            item.updatedAt,
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
    digest: (db) => {
      const rows = db
        .prepare('SELECT kind, repo, title FROM github_items ORDER BY updated_at DESC LIMIT 20')
        .all() as Array<{ kind: string; repo: string; title: string }>
      if (rows.length === 0) return ['No GitHub items']
      const reviews = rows.filter((row) => row.kind === 'review').length
      return [
        `GitHub: ${rows.length - reviews} notifications, ${reviews} review requests`,
        ...rows.slice(0, 5).map((row) => `${row.repo}: ${row.title}`),
      ]
    },
  }
}

export function createGithubApi(token: string | null): GithubApi | null {
  if (!token) return null
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'local-dashboard',
    'x-github-api-version': '2022-11-28',
  }

  return {
    async items() {
      const [notifications, reviews] = await Promise.all([
        fetch('https://api.github.com/notifications?per_page=50', { headers }),
        fetch(
          'https://api.github.com/search/issues?q=is:open+is:pr+review-requested:@me&per_page=20',
          { headers },
        ),
      ])

      if (!notifications.ok) throw new Error(`GitHub notifications responded ${notifications.status}`)
      if (!reviews.ok) throw new Error(`GitHub search responded ${reviews.status}`)

      const notificationData = (await notifications.json()) as Array<{
        id: string
        reason: string
        updated_at: string
        subject: { title: string; url: string | null }
        repository: { full_name: string }
      }>
      const reviewData = (await reviews.json()) as {
        items?: Array<{ id: number; title: string; html_url: string; updated_at: string }>
      }

      const items: GithubItem[] = notificationData.map((item) => ({
        id: `n-${item.id}`,
        kind: 'notification',
        repo: item.repository.full_name,
        title: item.subject.title,
        url: item.subject.url ?? '',
        updatedAt: item.updated_at,
      }))
      for (const issue of reviewData.items ?? []) {
        items.push({
          id: `r-${issue.id}`,
          kind: 'review',
          repo: new URL(issue.html_url).pathname.split('/')[1] ?? '',
          title: issue.title,
          url: issue.html_url,
          updatedAt: issue.updated_at,
        })
      }
      return items
    },
  }
}

export function githubCounts(db: DatabaseSync): { total: number; reviews: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(kind = 'review'), 0) AS reviews FROM github_items`,
    )
    .get() as { total: number; reviews: number }
  return row
}
