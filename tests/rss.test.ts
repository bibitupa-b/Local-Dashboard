import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { createRssSource, parseFeed, type RssApi, type RssItem } from '../src/server/sources/rss.js'

const now = new Date().toISOString()

function item(id: string, overrides: Partial<RssItem> = {}): RssItem {
  return {
    id,
    feed: 'https://example.com/rss.xml',
    title: `Item ${id}`,
    link: `https://example.com/${id}`,
    published: now,
    summary: 'Summary',
    ...overrides,
  }
}

function fakeApi(items: RssItem[]): RssApi {
  return { items: async () => items }
}

test('parses RSS and Atom into one shape', () => {
  const rss = parseFeed(
    `<rss><channel><item><title>Проект &amp; поиск</title><link>https://x.test/a</link><pubDate>Wed, 05 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Hello&lt;/p&gt;</description></item></channel></rss>`,
    'https://x.test/rss',
  )
  expect(rss[0]).toMatchObject({
    title: 'Проект & поиск',
    link: 'https://x.test/a',
    summary: 'Hello',
  })

  const atom = parseFeed(
    `<feed><entry><title>Atom item</title><link href="https://x.test/b"/><updated>2026-11-05T10:00:00Z</updated></entry></feed>`,
    'https://x.test/atom',
  )
  expect(atom[0]).toMatchObject({ title: 'Atom item', link: 'https://x.test/b' })
})

test('stores items and lists only those since the briefing window', async () => {
  const db = openDb(':memory:')
  const source = createRssSource(
    fakeApi([
      item('fresh', { title: 'Fresh headline' }),
      item('old', { title: 'Old headline', published: '2026-01-01T00:00:00.000Z' }),
    ]),
  )
  await source.sync(db)
  expect(db.prepare('SELECT COUNT(*) AS n FROM rss_items').get()).toEqual({ n: 2 })

  const digest = source.digest(db, new Date(Date.now() - 86_400_000)).join('\n')
  expect(digest).toContain('Fresh headline')
  expect(digest).not.toContain('Old headline')
})

test('an unconfigured feed list is inert', () => {
  expect(createRssSource(null).configured()).toBe(false)
})
