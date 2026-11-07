import { expect, test } from 'vitest'
import { newMailNotifications } from '../src/server/idle.js'
import type { AttentionItem } from '../src/server/attention.js'

const mail = (messageId: string): AttentionItem => ({
  kind: 'mail',
  label: 'Mail: 1 unread',
  detail: '',
  messageId,
})

const reply = (count: number): AttentionItem => ({
  kind: 'reply',
  label: `${count} awaiting your reply`,
  detail: '',
})

test('a message that was already visible is not announced again', () => {
  expect(newMailNotifications([mail('1')], [mail('1')], new Set())).toEqual([])
})

test('a newly arrived message announces once, then is marked seen', () => {
  const after = [mail('2')]
  expect(newMailNotifications([mail('1')], after, new Set()).map((i) => i.messageId)).toEqual(['2'])
  expect(newMailNotifications([mail('1')], after, new Set(['2']))).toEqual([])
})

test('a reply that was already visible does not re-notify', () => {
  expect(newMailNotifications([reply(1)], [reply(1)], new Set())).toEqual([])
  expect(newMailNotifications([], [reply(1)], new Set()).map((i) => i.label)).toEqual([
    '1 awaiting your reply',
  ])
})

test('non-mail attention is ignored', () => {
  const task: AttentionItem = { kind: 'task', label: 'do it', detail: '' }
  const calendar: AttentionItem = { kind: 'calendar', label: 'Standup', detail: '' }
  expect(newMailNotifications([task], [task, calendar], new Set())).toEqual([])
})
