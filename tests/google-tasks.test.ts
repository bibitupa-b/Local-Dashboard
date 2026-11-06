import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { buildAttention } from '../src/server/attention.js'
import {
  createGoogleTasksSource,
  type GoogleTask,
  type TasksApi,
} from '../src/server/sources/google-tasks.js'

const today = new Date().toLocaleDateString('en-CA')

function task(id: string, overrides: Partial<GoogleTask> = {}): GoogleTask {
  return {
    id,
    listId: 'inbox',
    title: `Task ${id}`,
    due: today,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function fakeApi(items: GoogleTask[]): TasksApi {
  return { list: async () => items }
}

test('stores Google Tasks and surfaces due ones in attention', async () => {
  const db = openDb(':memory:')
  const source = createGoogleTasksSource(fakeApi([task('1', { title: 'Send invoice' })]))
  await source.sync(db)

  expect(db.prepare('SELECT COUNT(*) AS n FROM google_tasks').get()).toEqual({ n: 1 })
  expect(source.digest(db, new Date()).join('\n')).toContain('Send invoice')

  const items = buildAttention(db, new Date(), { staleDays: 14, inboxDays: 3 })
  const google = items.find((item) => item.kind === 'google-task')
  expect(google?.label).toContain('Send invoice')
})

test('an unconfigured task source is inert', async () => {
  const db = openDb(':memory:')
  const source = createGoogleTasksSource(null)
  expect(source.configured()).toBe(false)
  await expect(source.sync(db)).resolves.toBeUndefined()
  expect(source.digest(db, new Date())).toEqual([])
})
