import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from './db/index.js'

export const LIST_KEYS = {
  mailSenders: 'mail_excluded_senders',
  mailFolders: 'mail_excluded_folders',
  vaultPrefixes: 'vault_excluded_prefixes',
} as const

export function getList(db: DatabaseSync, key: string): string[] {
  return (getSetting(db, key) ?? '')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
}

export function setList(db: DatabaseSync, key: string, values: string[]): void {
  setSetting(
    db,
    key,
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n'),
  )
}

export function isExcludedSender(db: DatabaseSync, sender: string): boolean {
  const haystack = sender.toLowerCase()
  return getList(db, LIST_KEYS.mailSenders).some((pattern) => haystack.includes(pattern))
}

export function isExcludedFolder(db: DatabaseSync, path: string): boolean {
  return getList(db, LIST_KEYS.mailFolders).some((pattern) => path.toLowerCase().includes(pattern))
}

export function isExcludedVaultPath(db: DatabaseSync, path: string): boolean {
  const haystack = path.toLowerCase()
  return getList(db, LIST_KEYS.vaultPrefixes).some((prefix) => haystack.startsWith(prefix))
}

export function digestWindowHours(db: DatabaseSync): number {
  const value = Number(getSetting(db, 'digest_window_hours'))
  return value > 0 ? value : 24
}

export function isSourceEnabled(db: DatabaseSync, id: string): boolean {
  const enabled = getList(db, 'enabled_sources')
  return enabled.length === 0 || enabled.includes(id.toLowerCase())
}
