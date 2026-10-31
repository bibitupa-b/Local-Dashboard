import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import {
  LIST_KEYS,
  digestWindowHours,
  getList,
  isExcludedFolder,
  isExcludedSender,
  isExcludedVaultPath,
  isSourceEnabled,
  setList,
} from '../src/server/settings.js'
import { setSetting } from '../src/server/db/index.js'

test('lists round-trip and match case-insensitively', () => {
  const db = openDb(':memory:')
  setList(db, LIST_KEYS.mailSenders, [' Noreply@Example.com ', 'bank'])
  expect(getList(db, LIST_KEYS.mailSenders)).toEqual(['noreply@example.com', 'bank'])
  expect(isExcludedSender(db, 'Example <NoReply@example.com>')).toBe(true)
  expect(isExcludedSender(db, 'Alice <alice@x.com>')).toBe(false)

  setList(db, LIST_KEYS.vaultPrefixes, ['04 Archives'])
  expect(isExcludedVaultPath(db, '04 Archives/old note.md')).toBe(true)
  expect(isExcludedVaultPath(db, '01 Projects/live.md')).toBe(false)

  setList(db, LIST_KEYS.mailFolders, ['spam'])
  expect(isExcludedFolder(db, '[Gmail]/Spam')).toBe(true)
})

test('sources are enabled by default and can be switched off', () => {
  const db = openDb(':memory:')
  expect(isSourceEnabled(db, 'mail')).toBe(true)
  setList(db, 'enabled_sources', ['vault', 'drive'])
  expect(isSourceEnabled(db, 'mail')).toBe(false)
  expect(isSourceEnabled(db, 'vault')).toBe(true)
})

test('digest window defaults to 24 hours', () => {
  const db = openDb(':memory:')
  expect(digestWindowHours(db)).toBe(24)
  setSetting(db, 'digest_window_hours', '6')
  expect(digestWindowHours(db)).toBe(6)
})
