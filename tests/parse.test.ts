import { expect, test } from 'vitest'
import { parseNote } from '../src/server/sources/vault/parse.js'

test('reads frontmatter, tasks, tags and checkboxes', () => {
  const note = parseNote(
    '---\nstatus: Undone\ntags:\n  - work\n---\n\n- [ ] #vitamins Zinc\n- [x] done thing\n',
  )
  expect(note.frontmatter).toEqual({ status: 'Undone', tags: ['work'] })
  expect(note.tasks).toEqual([
    { text: '#vitamins Zinc', tag: 'vitamins', done: false },
    { text: 'done thing', tag: null, done: true },
  ])
})

test('survives BOM, CRLF and missing frontmatter', () => {
  const note = parseNote('\uFEFF# Title\r\n- [ ] plain\r\n')
  expect(note.frontmatter).toEqual({})
  expect(note.tasks).toEqual([{ text: 'plain', tag: null, done: false }])
})

test('empty input is safe', () => {
  expect(parseNote('').tasks).toEqual([])
  expect(parseNote('').frontmatter).toEqual({})
})

test('inline array tags and other task syntaxes', () => {
  const note = parseNote('---\ntags: [idea, work]\n---\n* [ ] not a checkbox\n- [X] #Work: done upper\n')
  expect(note.frontmatter.tags).toEqual(['idea', 'work'])
  expect(note.tasks).toEqual([{ text: '#Work: done upper', tag: 'Work', done: true }])
})
