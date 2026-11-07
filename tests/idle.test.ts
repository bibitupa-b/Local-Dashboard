import { expect, test } from 'vitest'
import { createSerialRunner, newMailNotifications, nextIdleDelay } from '../src/server/idle.js'
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

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

test('serial runner never overlaps and coalesces calls into one rerun', async () => {
  let active = 0
  let maxActive = 0
  let started = 0
  const gates: Array<{ promise: Promise<void>; resolve: () => void }> = []
  const deferred = () => {
    let resolve!: () => void
    const promise = new Promise<void>((r) => (resolve = r))
    return { promise, resolve }
  }

  const runner = createSerialRunner(() => {
    started++
    active++
    maxActive = Math.max(maxActive, active)
    const gate = deferred()
    gates.push(gate)
    return gate.promise.finally(() => {
      active--
    })
  })

  runner()
  runner()
  runner()
  expect(started).toBe(1)

  gates[0]!.resolve()
  await gates[0]!.promise
  await flush()
  expect(started).toBe(2)
  expect(maxActive).toBe(1)

  gates[1]!.resolve()
  await gates[1]!.promise
  await flush()
  expect(started).toBe(2) // the two extra calls coalesced into a single rerun
  expect(maxActive).toBe(1)
})

test('a throwing run clears the guard and the next call still runs', async () => {
  let calls = 0
  const runner = createSerialRunner(async () => {
    calls++
    if (calls === 1) throw new Error('boom')
  })
  runner()
  await flush()
  expect(calls).toBe(1)
  runner()
  await flush()
  expect(calls).toBe(2)
})
