import { expect, test } from 'vitest'
import { MAX_DIGEST_CHARS, buildDigest } from '../src/server/briefing/digest.js'

const since = new Date('2026-10-30T08:00:00.000Z')

test('includes changed paths, counts and grouped tasks', () => {
  const digest = buildDigest({
    since,
    vaultChanges: [{ path: '01 Projects/Alpha.md', added: 12, removed: 3 }],
    tasks: [
      { text: '#vitamins Zinc', done: false, tag: 'vitamins' },
      { text: '#vitamins Copper', done: false, tag: 'vitamins' },
      { text: 'finished thing', done: true, tag: null },
    ],
    attention: [{ kind: 'inbox', label: 'Old idea', detail: 'In Inbox for 4 days' }],
    driveChanges: [{ name: 'Budget.xlsx', kind: 'modified' }],
  })
  expect(digest).toContain('01 Projects/Alpha.md (+12/-3)')
  expect(digest).toContain('#vitamins (2 open)')
  expect(digest).toContain('Budget.xlsx')
  expect(digest).toContain('In Inbox for 4 days')
})

test('empty day is still a valid digest', () => {
  const digest = buildDigest({ since, vaultChanges: [], tasks: [], attention: [], driveChanges: [] })
  expect(digest).toContain('No changes')
})

test('long input is truncated under the cap', () => {
  const digest = buildDigest({
    since,
    vaultChanges: Array.from({ length: 2000 }, (_, i) => ({
      path: `02 Areas/Long note number ${i} with a fairly long descriptive path.md`,
      added: i,
      removed: 0,
    })),
    tasks: Array.from({ length: 500 }, (_, i) => ({
      text: `open task ${i} with some description text`,
      done: false,
      tag: null,
    })),
    attention: [],
    driveChanges: [],
  })
  expect(digest.length).toBeLessThanOrEqual(MAX_DIGEST_CHARS)
})
