import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { loadConfig } from '../src/server/config.js'
import { createDriveSource, googleAuthUrl, type DriveApi } from '../src/server/sources/drive.js'

function fakeApi(pages: Array<{ files: Array<{ id: string; name: string; mimeType: string; modifiedTime: string }>; nextCursor: string | null }>): DriveApi {
  let call = 0
  return {
    async listSince() {
      return pages[call++] ?? { files: [], nextCursor: null }
    },
  }
}

test('first sync records files silently, later syncs log changes', async () => {
  const db = openDb(':memory:')
  const api = fakeApi([
    {
      files: [
        { id: 'f1', name: 'Plan.docx', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-10-30T10:00:00.000Z' },
      ],
      nextCursor: '2026-10-30T10:00:00.000Z',
    },
    {
      files: [
        { id: 'f1', name: 'Plan.docx', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-10-31T09:00:00.000Z' },
        { id: 'f2', name: 'Budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', modifiedTime: '2026-10-31T09:30:00.000Z' },
      ],
      nextCursor: '2026-10-31T09:30:00.000Z',
    },
  ])
  const source = createDriveSource(api)
  expect(source.configured()).toBe(true)

  await source.sync(db)
  expect(db.prepare('SELECT COUNT(*) AS n FROM drive_changes').get()).toEqual({ n: 0 })
  expect(db.prepare('SELECT COUNT(*) AS n FROM drive_files').get()).toEqual({ n: 1 })

  await source.sync(db)
  const changes = db.prepare('SELECT file_id, kind FROM drive_changes ORDER BY file_id').all()
  expect(changes).toEqual([
    { file_id: 'f1', kind: 'modified' },
    { file_id: 'f2', kind: 'added' },
  ])
})

test('unconfigured source is inert', async () => {
  const source = createDriveSource(null)
  expect(source.configured()).toBe(false)
  await expect(source.sync(openDb(':memory:'))).resolves.toBeUndefined()
})

test('failed sync leaves the cursor untouched', async () => {
  const db = openDb(':memory:')
  await createDriveSource(fakeApi([{ files: [], nextCursor: 'cursor-1' }])).sync(db)
  const failing: DriveApi = { listSince: async () => { throw new Error('network') } }
  await expect(createDriveSource(failing).sync(db)).rejects.toThrow('network')
  expect((db.prepare("SELECT value FROM settings WHERE key = 'drive_cursor'").get() as { value: string }).value).toBe('cursor-1')
})

test('exports text for changed Google Docs', async () => {
  const db = openDb(':memory:')
  const api = fakeApi([
    {
      files: [
        {
          id: 'd1',
          name: 'Plan',
          mimeType: 'application/vnd.google-apps.document',
          modifiedTime: '2026-10-31T10:00:00.000Z',
        },
      ],
      nextCursor: '2026-10-31T10:00:00.000Z',
    },
  ])
  api.exportText = async () => 'text from the doc'
  await createDriveSource(api).sync(db)

  expect(db.prepare('SELECT file_id, text FROM drive_doc_text').get()).toEqual({
    file_id: 'd1',
    text: 'text from the doc',
  })
})

test('consent URL carries the CSRF state and the configured port', () => {
  const config = loadConfig({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', PORT: '5000' })
  const url = new URL(googleAuthUrl(config, 'abc123')!)
  expect(url.searchParams.get('state')).toBe('abc123')
  expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5000/api/oauth/google/callback')
  expect(googleAuthUrl(loadConfig({}), 'x')).toBeNull()
})
