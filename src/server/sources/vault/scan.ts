import { readdir, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'

export type VaultEntry = {
  path: string
  hash: string
  mtime: string
  size: number
  text: string
}

const IGNORED_DIRS = new Set(['.obsidian', '.smart-env', '.stfolder', 'Attachments', '.git'])

function ignored(name: string): boolean {
  return IGNORED_DIRS.has(name) || name.startsWith('.')
}

export function isIgnoredPath(path: string): boolean {
  return path.split(/[\\/]/).some(ignored)
}

export async function scanVaultDetailed(
  root: string,
): Promise<{ entries: VaultEntry[]; complete: boolean }> {
  const entries: VaultEntry[] = []
  let complete = true

  async function walk(dir: string): Promise<void> {
    const items = await readdir(dir, { withFileTypes: true })
    for (const item of items) {
      if (item.isDirectory()) {
        if (!ignored(item.name)) await walk(join(dir, item.name))
        continue
      }
      if (!item.isFile() || !item.name.endsWith('.md')) continue
      const full = join(dir, item.name)
      try {
        const [text, info] = await Promise.all([readFile(full, 'utf8'), stat(full)])
        entries.push({
          path: relative(root, full).split(sep).join('/'),
          hash: createHash('sha256').update(text).digest('hex'),
          mtime: info.mtime.toISOString(),
          size: info.size,
          text,
        })
      } catch {
        // One locked or vanishing file must not abort the scan, but it also must
        // not look deleted, so the caller skips deletion reconciliation.
        complete = false
      }
    }
  }

  await walk(root)
  return { entries, complete }
}

export async function scanVault(root: string): Promise<VaultEntry[]> {
  return (await scanVaultDetailed(root)).entries
}
