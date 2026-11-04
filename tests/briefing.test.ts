import { expect, test } from 'vitest'
import { openDb, setSetting } from '../src/server/db/index.js'
import { loadConfig } from '../src/server/config.js'
import { createBriefing } from '../src/server/briefing/index.js'
import { BriefingError, generateBriefing } from '../src/server/briefing/deepseek.js'
import { shouldCatchUp, isEveningDue, isWeeklyDue } from '../src/server/briefing/schedule.js'
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

test('a 429 is retried and the second answer is kept', async () => {
  let calls = 0
  const fetchFn = (async () => {
    calls++
    if (calls === 1) return new Response('busy', { status: 429 })
    return new Response(JSON.stringify({ choices: [{ message: { content: '- ok' } }] }), {
      status: 200,
    })
  }) as unknown as typeof fetch

  const result = await generateBriefing('k', 'digest', {
    fetchFn,
    delays: [0],
    wait: async () => {},
  })
  expect(calls).toBe(2)
  expect(result.raw).toBe('- ok')
})

test('a 401 is not retried', async () => {
  let calls = 0
  const fetchFn = (async () => {
    calls++
    return new Response('nope', { status: 401 })
  }) as unknown as typeof fetch

  await expect(
    generateBriefing('k', 'digest', { fetchFn, delays: [0], wait: async () => {} }),
  ).rejects.toMatchObject({ status: 401 })
  expect(calls).toBe(1)
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
  expect('id' in result && Number.isInteger(result.id)).toBe(true)
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

test('the model, its token cost and a truncated answer reach the metadata', async () => {
  const db = openDb(':memory:')
  const fetchFn = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: '{"headline":"Day","bullets":[],"suggestion":""}' },
            finish_reason: 'length',
          },
        ],
        usage: { prompt_tokens: 1200, completion_tokens: 700 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch

  await createBriefing(db, [], config, { fetchFn })
  const row = db.prepare('SELECT digest_meta FROM briefings').get() as { digest_meta: string }
  expect(JSON.parse(row.digest_meta)).toMatchObject({
    model: 'deepseek-chat',
    usage: { prompt: 1200, completion: 700 },
    truncated: true,
  })
})

test('without a key the briefing is a plain list of what is waiting', async () => {
  const db = openDb(':memory:')
  const now = new Date('2026-11-04T12:00:00.000Z')
  const insert = db.prepare(
    `INSERT INTO tasks (path, text, occurrence, done, first_seen, last_seen)
     VALUES (?, ?, 0, 0, ?, ?)`,
  )
  insert.run('Inbox/Plan.md', 'call the bank', now.toISOString(), now.toISOString())
  insert.run('Inbox/Other.md', 'pay the invoice', now.toISOString(), now.toISOString())

  let called = false
  const fetchFn = (async () => {
    called = true
    return new Response('{}')
  }) as unknown as typeof fetch
  const result = await createBriefing(db, [], loadConfig({}), { fetchFn, now, trigger: 'auto' })

  // No key means no paid call, and the page still has something to read.
  expect(called).toBe(false)
  expect('body' in result && result.body.headline).toBe('2 things need you')
  const texts = 'body' in result ? result.body.bullets.map((bullet) => bullet.text) : []
  expect(texts).toEqual(
    expect.arrayContaining(['call the bank — Inbox/Plan.md', 'pay the invoice — Inbox/Other.md']),
  )
  expect('body' in result && result.body.bullets[0]!.refs).toEqual([])

  const row = db.prepare('SELECT digest, digest_meta, trigger FROM briefings').get() as {
    digest: string
    digest_meta: string
    trigger: string
  }
  expect(row.digest).toBe('')
  expect(row.trigger).toBe('auto')
  expect(JSON.parse(row.digest_meta)).toMatchObject({ model: 'rules', headline: '2 things need you' })
})

test('a quiet day without a key is named quiet, not a blank page', async () => {
  const db = openDb(':memory:')
  const result = await createBriefing(db, [], loadConfig({}), { now: new Date() })
  expect('body' in result && result.body.headline).toBe('Quiet day')
  expect('body' in result && result.body.bullets).toEqual([])
  expect('body' in result && result.body.suggestion).toBe('')
})

test('the reader profile reaches the prompt', async () => {
  const db = openDb(':memory:')
  setSetting(db, 'briefing_profile', 'Works on graphics tools.')
  let system = ''
  const fetchFn = (async (_url: string, init: RequestInit) => {
    system = JSON.parse(String(init.body)).messages[0].content
    return new Response(JSON.stringify({ choices: [{ message: { content: '- ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch

  await createBriefing(db, [], config, { fetchFn })
  expect(system).toContain('About the reader: Works on graphics tools.')
  expect(system).toMatch(/leave something out/i)
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

test('repeated saves of one note collapse into a single digest line', async () => {
  const db = openDb(':memory:')
  const now = new Date().toISOString()
  const insert = db.prepare(
    `INSERT INTO vault_changes (path, detected_at, added, removed, diff) VALUES (?, ?, ?, ?, '')`,
  )
  for (let save = 0; save < 5; save++) insert.run('01 Projects/Alpha.md', now, 2, 1)

  const sent = await sentDigest(db, [])
  expect(sent.match(/01 Projects\/Alpha\.md/g)).toHaveLength(1)
  expect(sent).toContain('(+10/-5)')
})

test('one Drive file changed five times is one line', async () => {
  const db = openDb(':memory:')
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO drive_files (id, name, mime_type, modified_time) VALUES ('f1', 'Budget.xlsx', 'sheet', ?)`,
  ).run(now)
  const insert = db.prepare(
    `INSERT INTO drive_changes (file_id, kind, detected_at) VALUES ('f1', 'modified', ?)`,
  )
  for (let save = 0; save < 5; save++) insert.run(now)

  const sent = await sentDigest(db, [])
  // The attention queue still lists each change; the digest section is the one that aggregates.
  const section = sent.split('## Google Drive')[1] ?? ''
  expect(section.match(/Budget\.xlsx/g)).toHaveLength(1)
})

test('the vault section stops at its cap', async () => {
  const db = openDb(':memory:')
  const now = new Date().toISOString()
  const insert = db.prepare(
    `INSERT INTO vault_changes (path, detected_at, added, removed, diff) VALUES (?, ?, 1, 0, '')`,
  )
  for (let note = 0; note < 60; note++) insert.run(`Inbox/note ${note}.md`, now)

  const sent = await sentDigest(db, [])
  const section = sent.split('## Vault changes')[1] ?? ''
  expect(section.split('\n').filter((line) => line.trim().startsWith('- '))).toHaveLength(40)
})

test("yesterday's headline reaches today's digest", async () => {
  const db = openDb(':memory:')
  db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown, digest_meta) VALUES (?, 'auto', '- old', ?)`,
  ).run(new Date().toISOString(), JSON.stringify({ headline: 'Yesterday was quiet' }))

  const sent = await sentDigest(db, [])
  expect(sent).toContain('## Previous briefing')
  expect(sent).toContain('Yesterday was quiet')
})

test("yesterday's suggestion reaches today's digest", async () => {
  const db = openDb(':memory:')
  db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown, digest_meta) VALUES (?, 'auto', '- old', ?)`,
  ).run(new Date().toISOString(), JSON.stringify({ suggestion: 'Открыть Alpha' }))

  const sent = await sentDigest(db, [])
  expect(sent).toContain('## Previous suggestion')
  expect(sent).toContain('Открыть Alpha')
})

test('an empty suggestion is not remembered', async () => {
  const db = openDb(':memory:')
  const fetchFn = answer(
    JSON.stringify({
      headline: 'Quiet day',
      bullets: [{ text: 'Alpha moved', refs: [] }],
      suggestion: '',
    }),
  )

  await createBriefing(db, [], config, { fetchFn })
  const row = db.prepare('SELECT digest_meta FROM briefings').get() as { digest_meta: string }
  expect(JSON.parse(row.digest_meta)).not.toHaveProperty('suggestion')
})

test('two miss verdicts reach the prompt as a weak signal', async () => {
  const db = openDb(':memory:')
  const insert = db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown, body, feedback)
     VALUES (?, 'auto', ?, ?, 'miss')`,
  )
  insert.run(
    '2026-11-03T08:00:00.000Z',
    '- one',
    JSON.stringify({ headline: 'Тихий день', bullets: [], suggestion: '' }),
  )
  insert.run('2026-11-02T08:00:00.000Z', 'Busy day\n- two', null)

  let system = ''
  const fetchFn = (async (_url: string, init: RequestInit) => {
    system = JSON.parse(String(init.body)).messages[0].content
    return new Response(JSON.stringify({ choices: [{ message: { content: '- ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch

  await createBriefing(db, [], config, { fetchFn })
  expect(system).toContain('Weak signal')
  expect(system).toContain('2026-11-03 miss — “Тихий день”')
  // Old rows without a body are named by their first markdown line.
  expect(system).toContain('2026-11-02 miss — “Busy day”')
})

test('a single verdict is not a signal', async () => {
  const db = openDb(':memory:')
  db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown, feedback)
     VALUES ('2026-11-03T08:00:00.000Z', 'auto', '- one', 'miss')`,
  ).run()

  let system = ''
  const fetchFn = (async (_url: string, init: RequestInit) => {
    system = JSON.parse(String(init.body)).messages[0].content
    return new Response(JSON.stringify({ choices: [{ message: { content: '- ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch

  await createBriefing(db, [], config, { fetchFn })
  expect(system).not.toContain('Weak signal')
})

test('a quiet day offers one forgotten note to the model', async () => {
  const db = openDb(':memory:')
  const old = new Date(Date.now() - 40 * 86_400_000).toISOString()
  db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES (?, 'h', ?, 1, ?)`,
  ).run('Inbox/Old idea.md', old, 'An idea about rain')

  const sent = await sentDigest(db, [])
  expect(sent).toContain('## Worth revisiting')
  expect(sent).toContain('Inbox/Old idea.md')
})

test('a note already offered does not come back tomorrow', async () => {
  const db = openDb(':memory:')
  const old = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const insert = db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES (?, 'h', ?, 1, 'text')`,
  )
  insert.run('Inbox/Already offered.md', old)
  insert.run('02 Areas/Next one.md', new Date(Date.now() - 60 * 86_400_000).toISOString())
  db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown, digest_meta) VALUES (?, 'auto', '- old', ?)`,
  ).run(
    new Date().toISOString(),
    JSON.stringify({ headline: 'Yesterday', resurface: 'Inbox/Already offered.md' }),
  )

  const sent = await sentDigest(db, [])
  const section = sent.split('## Worth revisiting')[1] ?? ''
  expect(section).toContain('02 Areas/Next one.md')
  // The attention queue may still name the old note; the resurfaced section must move on.
  expect(section).not.toContain('Already offered')
})

test('catch-up decision', () => {
  const now = new Date('2026-10-31T09:00:00')
  expect(shouldCatchUp(null, now, 8)).toBe(true)
  expect(shouldCatchUp(new Date('2026-10-31T00:10:00'), now, 8)).toBe(false)
  expect(shouldCatchUp(new Date('2026-10-30T08:00:00'), new Date('2026-10-31T07:59:00'), 8)).toBe(false)
  expect(shouldCatchUp(new Date('2026-10-30T08:00:00'), now, 8)).toBe(true)
})

test('the weekly review is due once per week', () => {
  const sunday = new Date(2026, 10, 8, 18)
  expect(isWeeklyDue(null, sunday)).toBe(true)
  expect(isWeeklyDue(new Date(2026, 10, 8, 9), sunday)).toBe(false)
  expect(isWeeklyDue(new Date(2026, 10, 4, 12), sunday)).toBe(false)
  expect(isWeeklyDue(new Date(2026, 10, 1, 18), sunday)).toBe(true)
  expect(isWeeklyDue(new Date(2026, 10, 2, 8), new Date(2026, 10, 4, 12))).toBe(false)
})

test('the evening pass is due once, after the morning briefing', () => {
  const morning = new Date(2026, 10, 4, 8, 0)
  const evening = new Date(2026, 10, 4, 18, 0)
  expect(isEveningDue(null, null, evening, 18)).toBe(false)
  expect(isEveningDue(morning, null, new Date(2026, 10, 4, 17, 59), 18)).toBe(false)
  expect(isEveningDue(morning, null, evening, 18)).toBe(true)
  expect(isEveningDue(morning, evening, evening, 18)).toBe(false)
  // Yesterday's morning briefing is not today's: no evening pass without one.
  expect(isEveningDue(new Date(2026, 10, 3, 8, 0), null, evening, 18)).toBe(false)
})

test('a weekly briefing stores its kind and a seven-day window', async () => {
  const db = openDb(':memory:')
  const now = new Date('2026-11-08T18:00:00.000Z')
  let sent = ''
  const fetchFn = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body)).messages[1].content
    return new Response(JSON.stringify({ choices: [{ message: { content: '- ok' } }] }), {
      status: 200,
    })
  }) as unknown as typeof fetch

  await createBriefing(db, [], config, { fetchFn, now, kind: 'weekly' })
  const row = db.prepare('SELECT kind, digest_meta FROM briefings').get() as {
    kind: string
    digest_meta: string
  }
  expect(row.kind).toBe('weekly')
  expect(Date.parse(JSON.parse(row.digest_meta).since)).toBe(now.getTime() - 7 * 86_400_000)
  expect(sent).toContain('## This week vs last')
})

test('the evening pass closes the day since the morning briefing', async () => {
  const db = openDb(':memory:')
  const morning = new Date(2026, 10, 4, 8, 0)
  const now = new Date(2026, 10, 4, 18, 0)
  db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown, kind) VALUES (?, 'auto', '- morning', 'daily')`,
  ).run(morning.toISOString())

  let sent = ''
  let system = ''
  const fetchFn = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    system = body.messages[0].content
    sent = body.messages[1].content
    return new Response(JSON.stringify({ choices: [{ message: { content: '- ok' } }] }), {
      status: 200,
    })
  }) as unknown as typeof fetch

  await createBriefing(db, [], config, { fetchFn, now, kind: 'evening' })
  expect(sent).toContain(`Window: ${morning.toISOString()}`)
  expect(system).toContain('evening pass')
  const row = db.prepare("SELECT kind FROM briefings WHERE kind = 'evening'").get() as {
    kind: string
  }
  expect(row.kind).toBe('evening')
  // The morning row is still there, so today still counts as briefed.
  expect(db.prepare("SELECT COUNT(*) AS n FROM briefings WHERE kind = 'daily'").get()).toEqual({
    n: 1,
  })
})

test('a note shown recently is skipped even when it is the oldest', async () => {
  const db = openDb(':memory:')
  const insert = db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES (?, 'h', ?, 1, 'text')`,
  )
  insert.run('Inbox/Recently.md', new Date(Date.now() - 90 * 86_400_000).toISOString())
  insert.run('02 Areas/Older.md', new Date(Date.now() - 60 * 86_400_000).toISOString())
  db.prepare('INSERT INTO resurfaced (path, last_at) VALUES (?, ?)').run(
    'Inbox/Recently.md',
    new Date(Date.now() - 10 * 86_400_000).toISOString(),
  )

  const sent = await sentDigest(db, [])
  const section = sent.split('## Worth revisiting')[1] ?? ''
  expect(section).toContain('02 Areas/Older.md')
  expect(section).not.toContain('Recently')
})

test('a note shown more than a month ago may come back', async () => {
  const db = openDb(':memory:')
  db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES (?, 'h', ?, 1, 'text')`,
  ).run('Inbox/Recurring.md', new Date(Date.now() - 60 * 86_400_000).toISOString())
  db.prepare('INSERT INTO resurfaced (path, last_at) VALUES (?, ?)').run(
    'Inbox/Recurring.md',
    new Date(Date.now() - 40 * 86_400_000).toISOString(),
  )

  const sent = await sentDigest(db, [])
  expect(sent.split('## Worth revisiting')[1] ?? '').toContain('Inbox/Recurring.md')
})

test('the resurface interval is spent only when the briefing succeeded', async () => {
  const db = openDb(':memory:')
  db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES (?, 'h', ?, 1, 'text')`,
  ).run('Inbox/Old idea.md', new Date(Date.now() - 40 * 86_400_000).toISOString())

  const failing = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch
  const result = await createBriefing(db, [], config, { fetchFn: failing })
  expect(result).toHaveProperty('error')
  expect(db.prepare('SELECT COUNT(*) AS n FROM resurfaced').get()).toEqual({ n: 0 })

  const sent = await sentDigest(db, [])
  expect(sent).toContain('## Worth revisiting')
  expect(db.prepare('SELECT path FROM resurfaced').get()).toEqual({ path: 'Inbox/Old idea.md' })
})
