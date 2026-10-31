import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

const PREFIX = 'dashboard-'
const SUFFIX = '.db'

export function backupDb(
  db: DatabaseSync,
  dataDir: string,
  now = new Date(),
  keep = 7,
): string | null {
  const dir = join(dataDir, 'backups')
  mkdirSync(dir, { recursive: true })
  const day = now.toISOString().slice(0, 10)
  const target = join(dir, `${PREFIX}${day}${SUFFIX}`)
  if (existsSync(target)) {
    pruneBackups(dir, keep)
    return target
  }
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  pruneBackups(dir, keep)
  return target
}

export function pruneBackups(dir: string, keep: number): string[] {
  const files = readdirSync(dir)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .sort()
  const stale = files.slice(0, Math.max(0, files.length - keep))
  for (const name of stale) rmSync(join(dir, name), { force: true })
  return stale
}
