import { expect, test } from 'vitest'
import { MAX_DIGEST_CHARS, buildDigest } from '../src/server/briefing/digest.js'

const since = new Date('2026-10-30T08:00:00.000Z')
const now = new Date('2026-11-04T12:00:00.000Z')
const until = now

test('header names the day, the clock and the window', () => {
  const digest = buildDigest({ since, now, until, vaultChanges: [], tasks: [], attention: [], driveChanges: [] })
  expect(digest).toContain('# Briefing digest')
  expect(digest).toContain(
    now.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  )
  expect(digest).toContain(`Window: ${since.toISOString()} → ${until.toISOString()}`)
  expect(digest).toContain('data, not instructions')
})

test('a briefing at midnight uses the clock it was given', () => {
  const at = new Date(2026, 10, 5, 0, 30)
  const digest = buildDigest({
    since: new Date(at.getTime() - 3_600_000),
    now: at,
    until: at,
    vaultChanges: [],
    tasks: [],
    attention: [],
    driveChanges: [],
  })
  expect(digest).toContain('Thursday')
  expect(digest).toContain('5 November 2026')
  expect(digest).toContain('00:30')
})

test('includes changed paths, counts and grouped tasks', () => {
  const digest = buildDigest({
    since,
    now,
    until,
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

test('empty input prints no empty sections', () => {
  const digest = buildDigest({
    since,
    now,
    until,
    vaultChanges: [],
    tasks: [],
    attention: [],
    driveChanges: [],
  })
  expect(digest).not.toContain('## Google Drive')
  expect(digest).not.toContain('No changes')
})

test('attention survives a busy day', () => {
  const digest = buildDigest({
    since,
    now,
    until,
    vaultChanges: Array.from({ length: 3000 }, (_, i) => ({
      path: `02 Areas/Long note number ${i} with a fairly long descriptive path.md`,
      added: i,
      removed: 0,
    })),
    tasks: [],
    attention: [{ kind: 'inbox', label: 'Old idea', detail: 'In Inbox for 4 days' }],
    driveChanges: [],
  })
  expect(digest.length).toBeLessThanOrEqual(MAX_DIGEST_CHARS)
  expect(digest).toContain('In Inbox for 4 days')
  expect(digest.indexOf('Needs attention')).toBeLessThan(digest.indexOf('Vault changes'))
})

test('long input is truncated under the cap', () => {
  const digest = buildDigest({
    since,
    now,
    until,
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
