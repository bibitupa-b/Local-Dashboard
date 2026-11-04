import { expect, test } from 'vitest'
import { openDb, setSetting } from '../src/server/db/index.js'
import { loadConfig } from '../src/server/config.js'
import { createBriefing } from '../src/server/briefing/index.js'
import { BriefingError, generateBriefing } from '../src/server/briefing/deepseek.js'
import { shouldCatchUp } from '../src/server/briefing/schedule.js'
import { digestWindowStart } from '../src/server/briefing/window.js'
import { sourceMeta, type Source, type SourceKind } from '../src/server/sources/types.js'

const config = loadConfig({ DEEPSEEK_API_KEY: 'test-key' })

test('digest window widens instead of shrinking', () => {
  const now = new Date('2026-11-04T12:00:00.000Z')
  expect(digestWindowStart(new Date('2026-11-04T11:55:00.000Z'), now, 24).toISOString()).toBe(
    '2026-11-03T12:00:00.000Z',
  )
  expect(digestWindowStart(new Date('2026-11-01T12:00:00.000Z'), now, 24).toISOString()).toBe(
    '2026-11-01T12:00:00.000Z',
  )
  expect(digestWindowStart(null, now, 24).toISOString()).toBe('2026-11-03T12:00:00.000Z')
})

test('401 from DeepSeek surfaces as BriefingError', async () => {
  const fetchFn = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
  await expect(generateBriefing('k', 'digest', { fetchFn })).rejects.toMatchObject({ status: 401 })
  await expect(generateBriefing('k', 'digest', { fetchFn })).rejects.toBeInstanceOf(BriefingError)
})

function answer(content: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
}

test('successful briefing is stored as a body and its markdown', async () => {
  const db = openDb(':memory:')
  const fetchFn = answer(
    JSON.stringify({
      headline: 'Quiet day',
      bullets: [{ text: 'Alpha moved', refs: [1] }],
      suggestion: 'Open Alpha',
    }),
  )

  const result = await createBriefing(db, [], config, { fetchFn, trigger: 'manual' })
  expect('body' in result && result.body.headline).toBe('Quiet day')
  expect('markdown' in result && result.markdown).toBe('Quiet day\n- Alpha moved\nSuggestion: Open Alpha')
  const row = db.prepare('SELECT trigger, markdown, digest, body, digest_meta FROM briefings').get() as {
    trigger: string
    markdown: string
    digest: string
    body: string
    digest_meta: string
  }
  expect(row.trigger).toBe('manual')
  expect(row.markdown).toBe('Quiet day\n- Alpha moved\nSuggestion: Open Alpha')
  expect(row.digest).toContain('# Briefing digest')
  expect(JSON.parse(row.body)).toEqual({
    headline: 'Quiet day',
    bullets: [{ text: 'Alpha moved', refs: [] }],
    suggestion: 'Open Alpha',
  })
  expect(JSON.parse(row.digest_meta).headline).toBe('Quiet day')
})

test('missing key refuses without calling the API', async () => {
  let called = false
  const fetchFn = (async () => {
    called = true
    return new Response('{}')
  }) as unknown as typeof fetch
  const result = await createBriefing(openDb(':memory:'), [], loadConfig({}), { fetchFn })
  expect(result).toEqual({ error: 'no-key' })
  expect(called).toBe(false)
})

test('excluded vault folders keep their tasks and attention out of the digest', async () => {
  const db = openDb(':memory:')
  setSetting(db, 'vault_excluded_prefixes', '02 areas/💪 body and health')

  const insertTask = db.prepare(
    `INSERT INTO tasks (path, text, occurrence, tag, done, first_seen, last_seen)
     VALUES (?, ?, 0, ?, 0, ?, ?)`,
  )
  const now = new Date()
  insertTask.run('02 Areas/💪 Body and Health/day.md', '#vitamins Zinc', 'vitamins', now.toISOString(), now.toISOString())
  insertTask.run('01 Projects/Live.md', 'real work item', null, now.toISOString(), now.toISOString())

  let sent = ''
  const fetchFn = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body)).messages[1].content
    return new Response(JSON.stringify({ choices: [{ message: { content: '- ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch

  await createBriefing(db, [], config, { fetchFn })
  expect(sent).not.toContain('vitamins')
  expect(sent).toContain('real work item')
})

function stubSource(id: string, kind: SourceKind, lines: string[]): Source {
  return {
    ...sourceMeta(kind, 'imap', id),
    configured: () => true,
    sync: async () => {},
    lastSync: () => null,
    digest: () => lines,
  }
}

async function sentDigest(db: ReturnType<typeof openDb>, sources: Source[]): Promise<string> {
  let sent = ''
  const fetchFn = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body)).messages[1].content
    return new Response(JSON.stringify({ choices: [{ message: { content: '- ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  await createBriefing(db, sources, config, { fetchFn })
  return sent
}

test('mail, calendar, github and browser reach the digest', async () => {
  const sent = await sentDigest(openDb(':memory:'), [
    stubSource('a', 'mail', ['- [mail] Invoice from Acme <a@acme.test>']),
    stubSource('b', 'calendar', ['- 10:00 Standup']),
    stubSource('c', 'github', ['- Review requested: octo/repo#12']),
    stubSource('d', 'browser', ['- 14 visits to example.com']),
  ])
  expect(sent).toContain('## Mail')
  expect(sent).toContain('Invoice from Acme')
  expect(sent).toContain('Standup')
  expect(sent).toContain('octo/repo#12')
  expect(sent).toContain('example.com')
})

test('two mail accounts share one section', async () => {
  const sent = await sentDigest(openDb(':memory:'), [
    stubSource('a', 'mail', ['- first account message']),
    stubSource('b', 'mail', ['- second account message']),
  ])
  expect(sent.match(/^## Mail$/gm)).toHaveLength(1)
  expect(sent).toContain('first account message')
  expect(sent).toContain('second account message')
})

test('catch-up decision', () => {
  const now = new Date('2026-10-31T09:00:00')
  expect(shouldCatchUp(null, now, 8)).toBe(true)
  expect(shouldCatchUp(new Date('2026-10-31T00:10:00'), now, 8)).toBe(false)
  expect(shouldCatchUp(new Date('2026-10-30T08:00:00'), new Date('2026-10-31T07:59:00'), 8)).toBe(false)
  expect(shouldCatchUp(new Date('2026-10-30T08:00:00'), now, 8)).toBe(true)
})
