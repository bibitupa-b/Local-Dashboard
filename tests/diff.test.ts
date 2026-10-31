import { expect, test } from 'vitest'
import { lineDiff } from '../src/server/sources/vault/diff.js'

test('counts an edited line', () => {
  expect(lineDiff('a\nb', 'a\nc')).toMatchObject({ added: 1, removed: 1 })
})

test('identical text has no diff', () => {
  expect(lineDiff('same', 'same')).toEqual({ added: 0, removed: 0, diff: '' })
})

test('diff text marks added and removed lines', () => {
  const { diff } = lineDiff('keep\nold', 'keep\nnew')
  expect(diff).toContain('-old')
  expect(diff).toContain('+new')
})

test('handles CRLF and trailing newline changes', () => {
  const { added, removed } = lineDiff('a\r\nb\r\n', 'a\nb')
  expect(added).toBe(0)
  expect(removed).toBe(0)
})

test('appending a line adds one', () => {
  expect(lineDiff('a', 'a\nb')).toMatchObject({ added: 1, removed: 0 })
})
