import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { buildApp } from '../src/server/app.js'
import { loadConfig } from '../src/server/config.js'
import { openDb, setSetting } from '../src/server/db/index.js'
import { createDriveSource } from '../src/server/sources/drive.js'
import { createVaultSource } from '../src/server/sources/vault/index.js'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'api-'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

function harness(apiKey?: string) {
  const db = openDb(':memory:')
  const config = loadConfig(apiKey ? { DEEPSEEK_API_KEY: apiKey, VAULT_PATH: root } : { VAULT_PATH: root })
  const sources = [createVaultSource(root), createDriveSource(null)]
  const app = buildApp({ db, config, sources, webRoot: join(root, 'no-ui') })
  return { app, db }
}

test('status reports configured sources and no briefing yet', async () => {
  const { app } = harness()
  const res = await app.inject({ method: 'GET', url: '/api/status' })
  expect(res.statusCode).toBe(200)
  expect(res.json().sources).toMatchObject([
    { id: 'vault:default', configured: true, lastSync: null },
    { id: 'drive:default', configured: false, lastSync: null },
  ])
  expect(res.json().briefingToday).toBe(false)
  await app.close()
})

test('status counts only a daily briefing as today\'s briefing', async () => {
  const { app, db } = harness()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown, kind) VALUES (?, 'auto', '- weekly', 'weekly')`,
  ).run(now)

  const weeklyOnly = await app.inject({ method: 'GET', url: '/api/status' })
  expect(weeklyOnly.json().briefingToday).toBe(false)
  expect(weeklyOnly.json().briefingKindsToday).toEqual(['weekly'])

  db.prepare(
    `INSERT INTO briefings (created_at, trigger, markdown, kind) VALUES (?, 'auto', '- daily', 'daily')`,
  ).run(now)
  const both = await app.inject({ method: 'GET', url: '/api/status' })
  expect(both.json().briefingToday).toBe(true)
  expect(both.json().briefingKindsToday.sort()).toEqual(['daily', 'weekly'])
  await app.close()
})

test('status exposes the last briefing failure and ignores a broken value', async () => {
  const { app, db } = harness()
  const first = await app.inject({ method: 'GET', url: '/api/status' })
  expect(first.json().briefingError).toBeNull()

  setSetting(
    db,
    'briefing_last_error',
    JSON.stringify({ at: '2026-11-04T05:00:00.000Z', message: 'DeepSeek responded 429' }),
  )
  const failed = await app.inject({ method: 'GET', url: '/api/status' })
  expect(failed.json().briefingError).toEqual({
    at: '2026-11-04T05:00:00.000Z',
    message: 'DeepSeek responded 429',
  })

  setSetting(db, 'briefing_last_error', '')
  const cleared = await app.inject({ method: 'GET', url: '/api/status' })
  expect(cleared.json().briefingError).toBeNull()

  setSetting(db, 'briefing_last_error', 'not json')
  const broken = await app.inject({ method: 'GET', url: '/api/status' })
  expect(broken.json().briefingError).toBeNull()
  await app.close()
})

test('attention respects disabled sources', async () => {
  const { app, db } = harness()
  const { setList } = await import('../src/server/settings.js')
  setList(db, 'enabled_sources', ['vault'])
  db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments, bulk)
     VALUES ('INBOX', 1, NULL, 'Alice <a@x.com>', 'Plan', ?, 0, 0, '', NULL, '[]', 0)`,
  ).run(new Date().toISOString())

  const res = await app.inject({ method: 'GET', url: '/api/attention' })
  expect(res.json().some((item: { kind: string }) => item.kind === 'mail')).toBe(false)
  await app.close()
})

test('feed groups entries by day, newest first', async () => {
  const { app, db } = harness()
  const insert = db.prepare(
    `INSERT INTO vault_changes (path, detected_at, added, removed, diff, text) VALUES (?, ?, 1, 0, '', '')`,
  )
  insert.run('today.md', '2026-10-31T10:00:00.000Z')
  insert.run('yesterday.md', '2026-10-30T10:00:00.000Z')

  const res = await app.inject({ method: 'GET', url: '/api/feed?days=3650' })
  const days = res.json().days as Array<{ date: string; items: Array<{ label: string }> }>
  expect(days.map((day) => day.date)).toEqual(['2026-10-31', '2026-10-30'])
  expect(days[0]!.items[0]!.label).toBe('today.md')
  await app.close()
})

test('generating without a key still returns a briefing', async () => {
  const { app, db } = harness()
  const res = await app.inject({ method: 'POST', url: '/api/briefings/generate' })
  expect(res.statusCode).toBe(200)
  expect(res.json().body.headline).toBe('Quiet day')
  const row = db.prepare('SELECT digest, digest_meta FROM briefings').get() as {
    digest: string
    digest_meta: string
  }
  expect(row.digest).toBe('')
  expect(JSON.parse(row.digest_meta).model).toBe('rules')
  await app.close()
})

test('generating while sources are still syncing returns 503', async () => {
  const db = openDb(':memory:')
  const config = loadConfig({ VAULT_PATH: root })
  const busy = buildApp({ db, config, sources: [], webRoot: join(root, 'no-ui'), isReady: () => false })
  const blocked = await busy.inject({ method: 'POST', url: '/api/briefings/generate' })
  expect(blocked.statusCode).toBe(503)
  await busy.close()
})

test('status carries health and the sync endpoint runs a sync', async () => {
  const db = openDb(':memory:')
  const config = loadConfig({ VAULT_PATH: root })
  let synced = 0
  const app = buildApp({
    db,
    config,
    sources: [createVaultSource(root)],
    webRoot: join(root, 'no-ui'),
    health: () => ({
      'vault:default': {
        lastError: 'boom',
        lastErrorAt: '2026-10-31T10:00:00.000Z',
        progress: null,
      },
    }),
    syncNow: async () => {
      synced++
    },
  })

  const status = await app.inject({ method: 'GET', url: '/api/status' })
  expect(status.json().sources[0]).toMatchObject({ id: 'vault:default', lastError: 'boom' })
  expect(status.json().sync).toMatchObject({ running: false })

  const sync = await app.inject({ method: 'POST', url: '/api/sync' })
  expect(sync.statusCode).toBe(200)
  expect(synced).toBe(1)
  await app.close()
})

test('export omits secrets and delete clears local data', async () => {
  const { app, db } = harness()
  db.prepare(
    `INSERT INTO briefings (id, created_at, trigger, markdown, kind) VALUES (1, ?, 'auto', '- one', 'daily')`,
  ).run(new Date().toISOString())
  db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments, bulk)
     VALUES ('INBOX', 1, NULL, 'Alice <a@x.com>', 'Plan', ?, 0, 0, '', NULL, '[]', 0)`,
  ).run(new Date().toISOString())
  setSetting(db, 'briefing_profile', 'private profile')

  const exported = await app.inject({ method: 'GET', url: '/api/export' })
  const payload = exported.json()
  expect(payload.briefings[0].markdown).toBe('- one')
  expect(payload.settings.briefing_profile).toBe('private profile')
  expect(JSON.stringify(payload)).not.toContain('secret')

  const deleted = await app.inject({ method: 'DELETE', url: '/api/data' })
  expect(deleted.statusCode).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM mail_messages').get()).toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM briefings').get()).toEqual({ n: 0 })
  expect(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key = 'briefing_profile'").get()).toEqual({ n: 0 })
  await app.close()
})

test('per-bullet feedback is stored and can be cleared', async () => {
  const { app, db } = harness()
  db.prepare(
    `INSERT INTO briefings (id, created_at, trigger, markdown, kind) VALUES (1, ?, 'auto', '- one', 'daily')`,
  ).run(new Date().toISOString())

  const useful = await app.inject({
    method: 'POST',
    url: '/api/briefings/1/bullets/0/feedback',
    payload: { value: 'useful' },
  })
  expect(useful.statusCode).toBe(200)
  expect(
    db.prepare('SELECT briefing_id, bullet_index, value FROM briefing_feedback').get(),
  ).toEqual({ briefing_id: 1, bullet_index: 0, value: 'useful' })

  const clear = await app.inject({
    method: 'POST',
    url: '/api/briefings/1/bullets/0/feedback',
    payload: { value: null },
  })
  expect(clear.statusCode).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM briefing_feedback').get()).toEqual({ n: 0 })
  await app.close()
})

test('FTS search is Unicode-aware and can filter by source', async () => {
  const { app, db } = harness()
  const { rebuildSearchIndex } = await import('../src/server/search-index.js')
  db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES (?, 'h', ?, 10, ?)`,
  ).run('01 Projects/Alpha.md', new Date().toISOString(), 'Проект про поиск')
  db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments, bulk)
     VALUES ('INBOX', 1, '<m1@x>', 'Alice <a@x.com>', 'Проект в письме', ?, 0, 0, 'проект', NULL, '[]', 0)`,
  ).run(new Date().toISOString())
  rebuildSearchIndex(db)

  const all = await app.inject({ method: 'GET', url: '/api/search?q=проект' })
  expect(all.json().notes).toHaveLength(1)
  expect(all.json().mail).toHaveLength(1)

  const mail = await app.inject({ method: 'GET', url: '/api/search?q=проект&source=mail' })
  expect(mail.json().notes).toEqual([])
  expect(mail.json().mail).toHaveLength(1)
  await app.close()
})

test('search respects disabled sources and excluded senders', async () => {
  const { app, db } = harness()
  const { setList, LIST_KEYS } = await import('../src/server/settings.js')
  setList(db, 'enabled_sources', ['vault'])
  setList(db, LIST_KEYS.mailSenders, ['spam'])
  db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments, bulk)
     VALUES ('INBOX', 1, NULL, 'Spam <spam@x.com>', 'Zen offer', ?, 0, 0, '', NULL, '[]', 0)`,
  ).run(new Date().toISOString())

  const res = await app.inject({ method: 'GET', url: '/api/search?q=zen' })
  expect(res.json().mail).toEqual([])
  await app.close()
})

test('activity is exposed separately from attention', async () => {
  const { app, db } = harness()
  db.prepare(
    `INSERT INTO browser_visits (url, domain, title, visited_at) VALUES ('https://x.test', 'x.test', '', ?)`,
  ).run(new Date().toISOString())

  const attention = await app.inject({ method: 'GET', url: '/api/attention' })
  expect(attention.json().some((item: { kind: string }) => item.kind === 'browser')).toBe(false)
  const activity = await app.inject({ method: 'GET', url: '/api/activity' })
  expect(activity.json().some((item: { kind: string }) => item.kind === 'browser')).toBe(true)
  await app.close()
})

test('connections expose their sync health', async () => {
  const db = openDb(':memory:')
  const config = loadConfig({ VAULT_PATH: root })
  const source = {
    ...(await import('../src/server/sources/types.js')).sourceMeta('vault', 'vault', 'vault-1', 'Main'),
    configured: () => true,
    sync: async () => {},
    lastSync: () => '2026-11-04T08:00:00.000Z',
    digest: () => [],
  }
  const app = buildApp({
    db,
    config,
    sources: [source],
    webRoot: join(root, 'no-ui'),
    connections: {
      list: () => [
        {
          id: 'vault-1',
          service: 'vault',
          label: 'Main',
          config: {},
          enabled: true,
          lastError: null,
          createdAt: '2026-11-01T00:00:00.000Z',
          secretsSet: [],
        },
      ],
      save: () => {
        throw new Error('not used')
      },
      remove: () => {},
      test: async () => ({ ok: true }),
    },
  })

  const res = await app.inject({ method: 'GET', url: '/api/connections' })
  expect(res.json().items[0]).toMatchObject({
    id: 'vault-1',
    configured: true,
    lastSync: '2026-11-04T08:00:00.000Z',
  })
  await app.close()
})

test('search covers notes, mail and drive names', async () => {
  const { app, db } = harness()
  db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES ('01 Projects/Zen.md', 'h', '2026-10-31T10:00:00.000Z', 10, 'a note about zen gardens')`,
  ).run()
  db.prepare(
    `INSERT INTO mail_messages (folder, uid, message_id, sender, subject, date, seen, starred, snippet, body, attachments, bulk)
     VALUES ('INBOX', 1, NULL, 'Zen <z@x.com>', 'Zen retreat', '2026-10-30T10:00:00.000Z', 0, 0, 'zen', NULL, '[]', 0)`,
  ).run()
  db.prepare(
    `INSERT INTO drive_files (id, name, mime_type, modified_time, parents) VALUES ('f1', 'Zen budget.xlsx', 'sheet', '2026-10-29T10:00:00.000Z', '[]')`,
  ).run()
  db.prepare(
    `INSERT INTO drive_files (id, name, mime_type, modified_time, parents) VALUES ('d1', 'Meeting notes', 'doc', '2026-10-28T10:00:00.000Z', '[]')`,
  ).run()
  db.prepare(
    `INSERT INTO drive_doc_text (file_id, text, updated_at) VALUES ('d1', 'discussed zen gardens and rocks', '2026-10-28T10:00:00.000Z')`,
  ).run()

  const res = await app.inject({ method: 'GET', url: '/api/search?q=zen' })
  expect(res.statusCode).toBe(200)
  const body = res.json()
  expect(body.notes[0].path).toBe('01 Projects/Zen.md')
  expect(body.mail[0].subject).toBe('Zen retreat')
  expect(body.drive[0].name).toBe('Zen budget.xlsx')
  expect(body.drive[0].id).toBe('f1')
  expect(body.mail[0].messageId).toBeNull()
  expect(body.drive.some((file: { name: string }) => file.name === 'Meeting notes')).toBe(true)

  const short = await app.inject({ method: 'GET', url: '/api/search?q=z' })
  expect(short.json()).toEqual({ notes: [], mail: [], drive: [] })
  await app.close()
})

test('note search snippet shows the matching line, not the note opening', async () => {
  const { app, db } = harness()
  const text = `${'filler line\n'.repeat(30)}the zen garden is here\nmore text`
  db.prepare(
    `INSERT INTO vault_files (path, hash, mtime, size, previous_text) VALUES ('Long.md', 'h', '2026-10-31T10:00:00.000Z', ?, ?)`,
  ).run(text.length, text)

  const res = await app.inject({ method: 'GET', url: '/api/search?q=zen' })
  const snippet = res.json().notes[0].snippet as string
  expect(snippet).toContain('zen garden is here')
  expect(snippet.startsWith('…')).toBe(true)
  await app.close()
})

test('vault change diff is returned by id', async () => {
  const { app, db } = harness()
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO vault_changes (path, detected_at, added, removed, diff) VALUES ('Inbox/x.md', '2026-10-31T10:00:00.000Z', 1, 1, '-old\\n+new')`,
    )
    .run()

  const res = await app.inject({ method: 'GET', url: `/api/vault/changes/${Number(lastInsertRowid)}` })
  expect(res.statusCode).toBe(200)
  expect(res.json()).toMatchObject({ path: 'Inbox/x.md', diff: expect.stringContaining('+new') })
  await app.close()
})

test('status exposes the active sync segment', async () => {
  const db = openDb(':memory:')
  const config = loadConfig({ VAULT_PATH: root })
  const app = buildApp({
    db,
    config,
    sources: [],
    webRoot: join(root, 'no-ui'),
    syncState: () => ({
      running: true,
      source: 'mail',
      sourceIndex: 2,
      sourceTotal: 6,
      done: 3,
      total: 7,
    }),
  })
  const res = await app.inject({ method: 'GET', url: '/api/status' })
  expect(res.json().sync).toEqual({
    running: true,
    source: 'mail',
    sourceIndex: 2,
    sourceTotal: 6,
    done: 3,
    total: 7,
  })
  await app.close()
})

test('the briefing list carries the parsed body and survives a broken one', async () => {
  const { app, db } = harness()
  const body = {
    headline: 'Quiet day',
    bullets: [{ text: 'Alpha moved', refs: [{ kind: 'note', label: 'Alpha', path: 'Alpha.md' }] }],
    suggestion: 'Open Alpha',
  }
  db.prepare(
    `INSERT INTO briefings (id, created_at, trigger, markdown, body) VALUES (1, '2026-11-04T08:00:00.000Z', 'auto', 'Quiet day', ?)`,
  ).run(JSON.stringify(body))
  db.prepare(
    `INSERT INTO briefings (id, created_at, trigger, markdown, body) VALUES (2, '2026-11-03T08:00:00.000Z', 'auto', '- old shape', 'not json')`,
  ).run()
  db.prepare(
    `INSERT INTO briefings (id, created_at, trigger, markdown, body) VALUES (3, '2026-11-02T08:00:00.000Z', 'auto', '- broken shape', ?)`,
  ).run(JSON.stringify({ headline: 'Half a body', bullets: [{ text: 'no refs here' }] }))

  const res = await app.inject({ method: 'GET', url: '/api/briefings' })
  const items = res.json().items as Array<{ id: number; body: unknown }>
  expect(items[0]).toMatchObject({ id: 3, body: null })
  expect(items[1]).toMatchObject({ id: 2, body: null })
  expect(items[2]).toMatchObject({ id: 1, body })
  await app.close()
})

test('the briefing language is saved through settings and junk is refused', async () => {
  const { app } = harness()
  const initial = await app.inject({ method: 'GET', url: '/api/settings' })
  expect(initial.json().briefingLanguage).toBe('auto')

  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { briefingLanguage: 'ru' },
  })
  const saved = await app.inject({ method: 'GET', url: '/api/settings' })
  expect(saved.json().briefingLanguage).toBe('ru')

  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { briefingLanguage: 'de' },
  })
  const after = await app.inject({ method: 'GET', url: '/api/settings' })
  expect(after.json().briefingLanguage).toBe('ru')
  await app.close()
})

test('the wallpaper is saved through settings and unknown ids are refused', async () => {
  const { app } = harness()
  const initial = await app.inject({ method: 'GET', url: '/api/settings' })
  expect(initial.json().wallpaper).toBe('aurora')

  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { wallpaper: 'lily-pond' },
  })
  const saved = await app.inject({ method: 'GET', url: '/api/settings' })
  expect(saved.json().wallpaper).toBe('lily-pond')

  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { wallpaper: '../../etc/passwd' },
  })
  const after = await app.inject({ method: 'GET', url: '/api/settings' })
  expect(after.json().wallpaper).toBe('lily-pond')
  await app.close()
})

test('appearance knobs are clamped, refused when nonsensical, and reset to auto', async () => {
  const { app } = harness()
  const initial = await app.inject({ method: 'GET', url: '/api/settings' })
  expect(initial.json().appearance).toEqual({
    blur: 14,
    glass: 100,
    grain: 12,
    shadow: 100,
    photo: 94,
    motion: 'balanced',
    accent: null,
  })

  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: {
      appearance: { blur: 90, glass: 5, grain: -4, shadow: 400, photo: 20, motion: 'loud' },
    },
  })
  const clamped = (await app.inject({ method: 'GET', url: '/api/settings' })).json().appearance
  expect(clamped.blur).toBe(30)
  expect(clamped.glass).toBe(60)
  expect(clamped.grain).toBe(0)
  expect(clamped.shadow).toBe(100)
  expect(clamped.photo).toBe(70)
  // An unknown preset never reaches the interface.
  expect(clamped.motion).toBe('balanced')

  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { appearance: { accent: 205, motion: 'calm' } },
  })
  const picked = (await app.inject({ method: 'GET', url: '/api/settings' })).json().appearance
  expect(picked.accent).toBe(205)
  expect(picked.motion).toBe('calm')

  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { appearance: { accent: null } },
  })
  const auto = (await app.inject({ method: 'GET', url: '/api/settings' })).json().appearance
  expect(auto.accent).toBeNull()
  await app.close()
})

test('source opens are counted and listed', async () => {
  const { app, db } = harness()
  db.prepare(
    `INSERT INTO briefings (id, created_at, trigger, markdown) VALUES (1, '2026-11-04T08:00:00.000Z', 'auto', '- one')`,
  ).run()

  const first = await app.inject({ method: 'POST', url: '/api/briefings/1/opened' })
  expect(first.statusCode).toBe(200)
  await app.inject({ method: 'POST', url: '/api/briefings/1/opened' })

  const list = await app.inject({ method: 'GET', url: '/api/briefings' })
  expect(list.json().items[0].opens).toBe(2)

  const missing = await app.inject({ method: 'POST', url: '/api/briefings/9999/opened' })
  expect(missing.statusCode).toBe(404)
  await app.close()
})

test('feedback is stored, validated and tied to a real briefing', async () => {
  const { app, db } = harness()
  db.prepare(
    `INSERT INTO briefings (id, created_at, trigger, markdown) VALUES (1, '2026-11-04T08:00:00.000Z', 'auto', '- one')`,
  ).run()

  const useful = await app.inject({
    method: 'POST',
    url: '/api/briefings/1/feedback',
    payload: { value: 'useful' },
  })
  expect(useful.statusCode).toBe(200)
  expect(
    (db.prepare('SELECT feedback FROM briefings WHERE id = 1').get() as { feedback: string })
      .feedback,
  ).toBe('useful')

  await app.inject({
    method: 'POST',
    url: '/api/briefings/1/feedback',
    payload: { value: 'miss' },
  })
  expect(
    (db.prepare('SELECT feedback FROM briefings WHERE id = 1').get() as { feedback: string })
      .feedback,
  ).toBe('miss')

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/briefings/1/feedback',
    payload: { value: 'great' },
  })
  expect(invalid.statusCode).toBe(400)

  const missing = await app.inject({
    method: 'POST',
    url: '/api/briefings/9999/feedback',
    payload: { value: 'useful' },
  })
  expect(missing.statusCode).toBe(404)

  // The page reads the verdict back from the list, so it survives a reload.
  const list = await app.inject({ method: 'GET', url: '/api/briefings' })
  expect(list.json().items[0].feedback).toBe('miss')
  await app.close()
})

test('connections API saves, tests and reloads sources', async () => {  const db = openDb(':memory:')
  const config = loadConfig({ VAULT_PATH: root })
  let reloads = 0
  const savedRows: Array<{ id: string; service: string; label: string }> = []
  const app = buildApp({
    db,
    config,
    sources: [],
    webRoot: join(root, 'no-ui'),
    reload: async () => {
      reloads++
    },
    connections: {
      list: () => [],
      save: (input) => {
        const row = {
          id: `${input.service}-test`,
          service: input.service,
          label: input.label,
          config: input.config,
          enabled: true,
          lastError: null,
          createdAt: '2026-11-01T00:00:00.000Z',
          secretsSet: Object.keys(input.secret ?? {}),
        }
        savedRows.push(row)
        return row
      },
      remove: () => {},
      test: async () => ({ ok: true }),
    },
  })

  const created = await app.inject({
    method: 'POST',
    url: '/api/connections',
    payload: { service: 'vault', label: 'Main', config: { path: 'C:/notes' } },
  })
  expect(created.statusCode).toBe(200)
  expect(created.json()).toMatchObject({ service: 'vault', label: 'Main' })
  expect(reloads).toBe(1)

  const tested = await app.inject({ method: 'POST', url: '/api/connections/vault-test/test' })
  expect(tested.json()).toEqual({ ok: true })

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/connections',
    payload: { label: 'no service' },
  })
  expect(invalid.statusCode).toBe(400)
  await app.close()
})

test('rejects foreign origins and hosts', async () => {
  const { app } = harness()

  const foreignOrigin = await app.inject({
    method: 'POST',
    url: '/api/sync',
    headers: { origin: 'https://evil.example' },
  })
  expect(foreignOrigin.statusCode).toBe(403)

  const foreignHost = await app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { host: 'evil.example' },
  })
  expect(foreignHost.statusCode).toBe(403)

  const local = await app.inject({
    method: 'POST',
    url: '/api/sync',
    headers: { origin: 'http://127.0.0.1:4317' },
  })
  expect(local.statusCode).toBe(200)

  const anotherLocalPort = await app.inject({
    method: 'POST',
    url: '/api/sync',
    headers: { origin: 'http://127.0.0.1:9999' },
  })
  expect(anotherLocalPort.statusCode).toBe(403)
  await app.close()
})

test('sets security headers on responses', async () => {
  const { app } = harness()
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  expect(res.headers['content-security-policy']).toContain("default-src 'self'")
  expect(res.headers['x-content-type-options']).toBe('nosniff')
  expect(res.headers['x-frame-options']).toBe('DENY')
  expect(res.headers['referrer-policy']).toBe('no-referrer')
  await app.close()
})

test('unknown api route returns json 404', async () => {
  const { app } = harness()
  const res = await app.inject({ method: 'GET', url: '/api/nope' })
  expect(res.statusCode).toBe(404)
  expect(res.json()).toEqual({ error: 'not found' })
  await app.close()
})

function askHarness(ask: (digest: string, question: string) => Promise<string>) {
  const db = openDb(':memory:')
  const config = loadConfig({ DEEPSEEK_API_KEY: 'test-key', VAULT_PATH: root })
  const app = buildApp({ db, config, sources: [], webRoot: join(root, 'no-ui'), ask })
  db.prepare(
    `INSERT INTO briefings (id, created_at, trigger, markdown, digest)
     VALUES (1, '2026-11-04T08:00:00.000Z', 'auto', '- one', '# Briefing digest\nMail: 47 unread')`,
  ).run()
  return { app, db }
}

test('a question about the digest is answered from the digest alone', async () => {
  const asked: Array<[string, string]> = []
  const { app } = askHarness(async (digest, question) => {
    asked.push([digest, question])
    return 'The digest says 47 unread messages.'
  })

  const res = await app.inject({
    method: 'POST',
    url: '/api/briefings/1/ask',
    payload: { question: 'Why 47 mails?' },
  })
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ answer: 'The digest says 47 unread messages.' })
  expect(asked).toEqual([['# Briefing digest\nMail: 47 unread', 'Why 47 mails?']])
  await app.close()
})

test('an empty question is refused before any call', async () => {
  const { app } = askHarness(async () => 'should not run')
  const res = await app.inject({
    method: 'POST',
    url: '/api/briefings/1/ask',
    payload: { question: '   ' },
  })
  expect(res.statusCode).toBe(400)
  await app.close()
})

test('a question about a briefing that does not exist is a 404', async () => {
  const { app } = askHarness(async () => 'should not run')
  const res = await app.inject({
    method: 'POST',
    url: '/api/briefings/9999/ask',
    payload: { question: 'Anything?' },
  })
  expect(res.statusCode).toBe(404)
  await app.close()
})

test('a second question waits for the first answer', async () => {
  let release = () => {}
  let started = () => {}
  const callStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const { app } = askHarness(async () => {
    started()
    await pending
    return 'One answer at a time.'
  })

  const first = app.inject({
    method: 'POST',
    url: '/api/briefings/1/ask',
    payload: { question: 'Why?' },
  })
  await callStarted
  const second = await app.inject({
    method: 'POST',
    url: '/api/briefings/1/ask',
    payload: { question: 'And another?' },
  })
  expect(second.statusCode).toBe(429)
  release()
  expect((await first).json()).toEqual({ answer: 'One answer at a time.' })
  await app.close()
})
