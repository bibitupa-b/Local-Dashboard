import { expect, test } from 'vitest'
import { newMailNotifications, nextIdleDelay } from '../src/server/idle.js'
import type { AttentionItem } from '../src/server/attention.js'

test('idle backoff doubles and caps at five minutes', () => {
  expect([0, 1, 2, 8, 20].map(nextIdleDelay)).toEqual([1000, 2000, 4000, 256000, 300000])
})

test('only new mail and reply items notify, once', () => {
  const before: AttentionItem[] = [
    { kind: 'mail', label: 'old', detail: '', messageId: '1' },
  ]
  const after: AttentionItem[] = [
    ...before,
    { kind: 'mail', label: 'new', detail: '', messageId: '2' },
    { kind: 'task', label: 'task', detail: '' },
  ]
  expect(newMailNotifications(before, after, new Set(['1'])).map((i) => i.label)).toEqual(['new'])
  expect(newMailNotifications(before, after, new Set(['1', '2']))).toEqual([])
})
