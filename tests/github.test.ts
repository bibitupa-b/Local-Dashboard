import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import { createGithubSource, type GithubApi, type GithubItem } from '../src/server/sources/github.js'

function item(id: string, overrides: Partial<GithubItem> = {}): GithubItem {
  return {
    id,
    kind: 'notification',
    repo: 'bibi/local-dashboard',
    title: `Item ${id}`,
    url: '',
    updatedAt: '2026-10-31T10:00:00.000Z',
    ...overrides,
  }
}

function fakeApi(items: GithubItem[]): GithubApi {
  return { items: async () => items }
}

test('sync replaces the item list and reports counts', async () => {
  const db = openDb(':memory:')
  const source = createGithubSource(fakeApi([item('1'), item('2', { kind: 'review' })]))

  await source.sync(db)
  expect(db.prepare('SELECT COUNT(*) AS n FROM github_items').get()).toEqual({ n: 2 })
  expect(source.digest(db, new Date()).join('\n')).toContain('1 review requests')

  await createGithubSource(fakeApi([item('3')])).sync(db)
  expect(db.prepare('SELECT id FROM github_items').all()).toEqual([{ id: '3' }])
})

test('unconfigured source is inert', async () => {
  const db = openDb(':memory:')
  const source = createGithubSource(null)
  expect(source.configured()).toBe(false)
  await expect(source.sync(db)).resolves.toBeUndefined()
})

test('github items show up in attention', async () => {
  const db = openDb(':memory:')
  await createGithubSource(fakeApi([item('1'), item('2', { kind: 'review' })])).sync(db)
  const items = buildAttention(db, new Date(), { staleDays: 14, inboxDays: 3 })
  const github = items.find((entry) => entry.kind === 'github')
  expect(github?.label).toBe('GitHub: 2 items')
  expect(github?.detail).toContain('1 review requests')
})
