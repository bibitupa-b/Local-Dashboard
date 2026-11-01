import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import {
  chromiumMicrosToIso,
  isoToChromiumMicros,
} from '../src/server/sources/browser-chromium.js'
import {
  createBrowserSource,
  domainOf,
  type BrowserReader,
  type BrowserVisit,
} from '../src/server/sources/browser.js'
import { setList, LIST_KEYS } from '../src/server/settings.js'

test('chromium timestamps round-trip', () => {
  const iso = '2026-10-31T12:00:00.000Z'
  expect(chromiumMicrosToIso(isoToChromiumMicros(iso))).toBe(iso)
})

test('domains drop www and reject junk URLs', () => {
  expect(domainOf('https://www.github.com/a/b')).toBe('github.com')
  expect(domainOf('chrome://settings')).toBe('settings')
  expect(domainOf('not a url')).toBeNull()
})

test('indexes visits and skips excluded domains', async () => {
  const db = openDb(':memory:')
  setList(db, LIST_KEYS.browserDomains, ['bank'])
  const visits: BrowserVisit[] = [
    { url: 'https://github.com/x', domain: 'github.com', title: 'GH', visitedAt: '2026-10-31T10:00:00.000Z' },
    { url: 'https://bank.example/x', domain: 'bank.example', title: 'Bank', visitedAt: '2026-10-31T10:05:00.000Z' },
  ]
  const reader: BrowserReader = {
    path: 'fake',
    visitsSince: async () => visits,
  }

  await createBrowserSource(reader).sync(db)
  const rows = db.prepare('SELECT domain, count(*) AS n FROM browser_visits GROUP BY domain').all()
  expect(rows).toEqual([{ domain: 'github.com', n: 1 }])
  expect(db.prepare("SELECT value FROM settings WHERE key = 'browser_cursor'").get()).toEqual({
    value: '2026-10-31T10:05:00.000Z',
  })

  await createBrowserSource(reader).sync(db)
  expect(db.prepare('SELECT COUNT(*) AS n FROM browser_visits').get()).toEqual({ n: 1 })
})

test('chromium reader starts from the newest visits and then goes forward', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { DatabaseSync } = await import('node:sqlite')
  const { createChromiumBrowserReader } = await import('../src/server/sources/browser-chromium.js')

  const dir = mkdtempSync(join(tmpdir(), 'history-'))
  try {
    const historyPath = join(dir, 'History')
    const chrome = new DatabaseSync(historyPath)
    chrome.exec(
      'CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, last_visit_time INTEGER)',
    )
    const insert = chrome.prepare('INSERT INTO urls (url, title, last_visit_time) VALUES (?, ?, ?)')
    insert.run('https://one.com/a', 'One', isoToChromiumMicros('2026-10-01T10:00:00.000Z'))
    insert.run('https://two.com/b', 'Two', isoToChromiumMicros('2026-10-02T10:00:00.000Z'))
    insert.run('https://three.com/c', 'Three', isoToChromiumMicros('2026-10-03T10:00:00.000Z'))
    chrome.close()

    const reader = createChromiumBrowserReader(join(dir, 'data'), historyPath)!
    const latest = await reader.visitsSince(null, 2)
    expect(latest.map((visit) => visit.domain)).toEqual(['two.com', 'three.com'])

    const incremental = await reader.visitsSince('2026-10-02T10:00:00.000Z')
    expect(incremental.map((visit) => visit.domain)).toEqual(['three.com'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('digest reports aggregates, never URLs', async () => {
  const db = openDb(':memory:')
  const insert = db.prepare(
    `INSERT INTO browser_visits (url, domain, title, visited_at) VALUES (?, ?, ?, ?)`,
  )
  const fresh = new Date().toISOString()
  insert.run('https://youtube.com/watch?v=secret', 'youtube.com', 'Secret video', fresh)
  insert.run('https://github.com/a/b', 'github.com', 'Repo', fresh)

  const source = createBrowserSource({
    path: 'fake',
    visitsSince: async () => [],
  })
  const lines = source.digest(db, new Date(Date.now() - 86_400_000)).join('\n')
  expect(lines).toContain('Browsing: 2 visits')
  expect(lines).toContain('youtube.com (1)')
  expect(lines).not.toContain('secret')
  expect(lines).not.toContain('https://')
})

test('today visits appear in attention', () => {
  const db = openDb(':memory:')
  const now = new Date()
  db.prepare(
    `INSERT INTO browser_visits (url, domain, title, visited_at) VALUES (?, ?, ?, ?)`,
  ).run('https://github.com/a', 'github.com', 'Repo', now.toISOString())

  const items = buildAttention(db, now, { staleDays: 14, inboxDays: 3 })
  const item = items.find((entry) => entry.kind === 'browser')
  expect(item?.label).toContain('1 visits today')
  expect(item?.detail).toContain('github.com')
})
