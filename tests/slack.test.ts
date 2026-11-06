import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import {
  createSlackSource,
  type SlackApi,
  type SlackMention,
} from '../src/server/sources/slack.js'

function mention(id: string, overrides: Partial<SlackMention> = {}): SlackMention {
  return {
    channelId: 'C1',
    channelName: 'general',
    userId: 'U1',
    ts: id,
    isDm: false,
    ...overrides,
  }
}

function fakeApi(items: SlackMention[]): SlackApi {
  return { mentions: async () => items }
}

test('stores mentions and surfaces them as a Slack attention item', async () => {
  const db = openDb(':memory:')
  const source = createSlackSource(
    fakeApi([
      mention('1', { channelName: 'general' }),
      mention('2', { channelName: 'design', isDm: true }),
    ]),
  )
  await source.sync(db)

  expect(db.prepare('SELECT COUNT(*) AS n FROM slack_mentions').get()).toEqual({ n: 2 })
  expect(source.digest(db, new Date()).join('\n')).toContain('2 mentions')

  const item = buildAttention(db, new Date(), { staleDays: 14, inboxDays: 3 }).find(
    (entry) => entry.kind === 'slack',
  )
  expect(item?.count).toBe(2)
  expect(item?.detail).toContain('general')
})

test('an unconfigured Slack source is inert', async () => {
  const db = openDb(':memory:')
  const source = createSlackSource(null)
  expect(source.configured()).toBe(false)
  await expect(source.sync(db)).resolves.toBeUndefined()
  expect(source.digest(db, new Date())).toEqual([])
})
