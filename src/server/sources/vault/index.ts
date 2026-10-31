import type { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { relative as relativePath, sep } from 'node:path'
import chokidar from 'chokidar'
import { lineDiff } from './diff.js'
import { parseNote } from './parse.js'
import { scanVault, type VaultEntry } from './scan.js'
import { setSetting } from '../../db/index.js'
import type { Source } from '../types.js'

type FileRow = { hash: string; mtime: string; size: number; previous_text: string }

function lineCount(text: string): number {
  const trimmed = text.replace(/\r\n/g, '\n').replace(/\n$/, '')
  return trimmed === '' ? 0 : trimmed.split('\n').length
}

function refreshTasks(db: DatabaseSync, path: string, text: string, now: string): void {
  const kept = new Map<string, string>()
  for (const row of db.prepare('SELECT text, first_seen FROM tasks WHERE path = ?').all(path)) {
    const { text: taskText, first_seen } = row as { text: string; first_seen: string }
    kept.set(taskText, first_seen)
  }
  db.prepare('DELETE FROM tasks WHERE path = ?').run(path)
  const insert = db.prepare(
    `INSERT OR IGNORE INTO tasks (path, text, tag, done, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const task of parseNote(text).tasks) {
    insert.run(path, task.text, task.tag, task.done ? 1 : 0, kept.get(task.text) ?? now, now)
  }
}

export function applyVaultChanges(
  db: DatabaseSync,
  entries: VaultEntry[],
  now: Date = new Date(),
): number {
  const nowIso = now.toISOString()
  const existing = new Map<string, FileRow>()
  for (const row of db.prepare('SELECT path, hash, mtime, size, previous_text FROM vault_files').all()) {
    const { path, ...rest } = row as { path: string } & FileRow
    existing.set(path, rest)
  }

  const upsert = db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, mtime = excluded.mtime,
       size = excluded.size, previous_text = excluded.previous_text`,
  )
  const record = db.prepare(
    `INSERT INTO vault_changes (path, detected_at, added, removed, diff, text) VALUES (?, ?, ?, ?, ?, ?)`,
  )

  let changes = 0
  const seen = new Set<string>()
  for (const entry of entries) {
    seen.add(entry.path)
    const previous = existing.get(entry.path)
    if (previous && previous.hash === entry.hash) continue

    if (previous) {
      const { added, removed, diff } = lineDiff(previous.previous_text, entry.text)
      record.run(entry.path, nowIso, added, removed, diff, entry.text)
    } else {
      record.run(entry.path, nowIso, lineCount(entry.text), 0, '', entry.text)
    }
    upsert.run(entry.path, entry.hash, entry.mtime, entry.size, entry.text)
    refreshTasks(db, entry.path, entry.text, nowIso)
    changes++
  }

  for (const path of existing.keys()) {
    if (seen.has(path)) continue
    const removed = lineCount(existing.get(path)!.previous_text)
    record.run(path, nowIso, 0, removed, '', '')
    db.prepare('DELETE FROM vault_files WHERE path = ?').run(path)
    db.prepare('DELETE FROM tasks WHERE path = ?').run(path)
    changes++
  }

  return changes
}

export function createVaultSource(root: string): Source {
  return {
    id: 'vault',
    configured: () => existsSync(root),
    async sync(db, now = new Date()) {
      const entries = await scanVault(root)
      applyVaultChanges(db, entries, now)
      setSetting(db, 'last_sync_vault', now.toISOString())
    },
    lastSync: (db) =>
      (db.prepare("SELECT value FROM settings WHERE key = 'last_sync_vault'").get() as
        | { value: string }
        | undefined)?.value ?? null,
    digest: (db, since) =>
      db
        .prepare(
          `SELECT path, added, removed FROM vault_changes WHERE detected_at >= ? ORDER BY detected_at DESC`,
        )
        .all(since.toISOString())
        .map((row) => {
          const { path, added, removed } = row as { path: string; added: number; removed: number }
          return `${path} (+${added}/-${removed})`
        }),
  }
}

export function startVaultWatcher(root: string, db: DatabaseSync): () => Promise<void> {
  const pending = new Set<string>()
  let timer: NodeJS.Timeout | undefined

  const watcher = chokidar.watch(root, {
    ignoreInitial: true,
    persistent: true,
    ignored: (path) => /[\\/](\.obsidian|\.smart-env|\.stfolder|Attachments)([\\/]|$)/.test(path),
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })

  async function flush(): Promise<void> {
    const paths = [...pending]
    pending.clear()
    const entries: VaultEntry[] = []
    for (const full of paths) {
      if (!full.endsWith('.md')) continue
      try {
        const [text, info] = await Promise.all([readFile(full, 'utf8'), stat(full)])
        entries.push({
          path: relativePath(root, full).split(sep).join('/'),
          hash: createHash('sha256').update(text).digest('hex'),
          mtime: info.mtime.toISOString(),
          size: info.size,
          text,
        })
      } catch {
        // file vanished or is unreadable; the next full scan reconciles deletions
      }
    }
    if (entries.length > 0) applyVaultChanges(db, entries)
  }

  const schedule = (path: string) => {
    pending.add(path)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), 1000)
  }

  watcher.on('add', schedule).on('change', schedule)
  watcher.on('unlink', (path: string) => {
    const relative = relativePath(root, path).split(sep).join('/')
    const row = db.prepare('SELECT previous_text FROM vault_files WHERE path = ?').get(relative) as
      | { previous_text: string }
      | undefined
    if (!row) return
    db.prepare(
      `INSERT INTO vault_changes (path, detected_at, added, removed, diff, text) VALUES (?, ?, 0, ?, '', '')`,
    ).run(relative, new Date().toISOString(), lineCount(row.previous_text))
    db.prepare('DELETE FROM vault_files WHERE path = ?').run(relative)
    db.prepare('DELETE FROM tasks WHERE path = ?').run(relative)
  })

  return async () => {
    if (timer) clearTimeout(timer)
    await watcher.close()
  }
}
