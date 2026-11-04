import { expect, test } from 'vitest'
import { parseModelOutput, renderMarkdown, resolveRefs } from '../src/server/briefing/body.js'
import { systemPrompt } from '../src/server/briefing/deepseek.js'
import type { DigestRef } from '../src/server/briefing/digest.js'
import { openDb, setSetting } from '../src/server/db/index.js'
import { briefingProfile } from '../src/server/settings.js'

const refs = new Map<number, DigestRef>([
  [1, { kind: 'note', label: 'Alpha', path: '01 Projects/Alpha.md' }],
  [2, { kind: 'drive', label: 'Budget.xlsx', fileId: 'f1' }],
])

test('parses the JSON schema the model was asked for', () => {
  const parsed = parseModelOutput(
    JSON.stringify({
      headline: 'Quiet day',
      bullets: [
        { text: 'Alpha moved', refs: [1, 2] },
        { text: 'Mail is waiting', refs: [] },
      ],
      suggestion: 'Open Alpha',
    }),
  )
  expect(parsed).toEqual({
    headline: 'Quiet day',
    bullets: [
      { text: 'Alpha moved', refs: [1, 2] },
      { text: 'Mail is waiting', refs: [] },
    ],
    suggestion: 'Open Alpha',
  })
})

test('prose from the model still yields a headline and bullets', () => {
  const parsed = parseModelOutput('Quiet day\n- Alpha moved\n- Mail is waiting\nSuggestion: Open Alpha')
  expect(parsed.headline).toBe('Quiet day')
  expect(parsed.bullets.map((bullet) => bullet.text)).toEqual(['Alpha moved', 'Mail is waiting'])
  expect(parsed.suggestion).toBe('Open Alpha')
})

test('a truncated JSON answer falls back to its lines instead of throwing', () => {
  const parsed = parseModelOutput('{"headline":"Quiet day","bullets":[{"text":"Al')
  expect(parsed.headline.length).toBeGreaterThan(0)
  expect(Array.isArray(parsed.bullets)).toBe(true)
})

test('junk inside refs is dropped, not trusted', () => {
  const parsed = parseModelOutput(
    JSON.stringify({
      headline: 'Day',
      bullets: [{ text: 'Alpha moved', refs: [1, 'two', -3, 1.5, 99] }],
      suggestion: '',
    }),
  )
  expect(parsed.bullets[0]!.refs).toEqual([1, 99])
})

test('overlong fields are cut to their cap', () => {
  const parsed = parseModelOutput(
    JSON.stringify({
      headline: 'h'.repeat(300),
      bullets: [{ text: 'b'.repeat(500), refs: [] }],
      suggestion: 's'.repeat(400),
    }),
  )
  expect(parsed.headline.length).toBe(200)
  expect(parsed.bullets[0]!.text.length).toBe(400)
  expect(parsed.suggestion.length).toBe(300)
})

test('resolveRefs drops unknown numbers and duplicates', () => {
  const body = resolveRefs(
    { headline: 'Day', bullets: [{ text: 'Alpha moved', refs: [99, 1, 1] }], suggestion: '' },
    refs,
  )
  expect(body.bullets[0]!.refs).toEqual([refs.get(1)])
  expect(body.bullets).toHaveLength(1)
})

test('markdown is the headline, the bullets and the suggestion', () => {
  expect(
    renderMarkdown({
      headline: 'Quiet day',
      bullets: [{ text: 'Alpha moved', refs: [] }],
      suggestion: 'Open Alpha',
    }),
  ).toBe('Quiet day\n- Alpha moved\nSuggestion: Open Alpha')
})

test('a body without a suggestion renders no closing line', () => {
  expect(renderMarkdown({ headline: 'Quiet day', bullets: [], suggestion: '' })).toBe('Quiet day')
})

test('a quiet day is its headline and one point, with no closing line', () => {
  expect(
    renderMarkdown({
      headline: 'Quiet day',
      bullets: [{ text: 'Alpha moved', refs: [] }],
      suggestion: '',
    }),
  ).toBe('Quiet day\n- Alpha moved')
})

test('the prompt makes a quiet day one point without a suggestion', () => {
  expect(systemPrompt('auto')).toMatch(/one bullet, no suggestion/i)
})

test('the prompt names the chosen briefing language', () => {
  expect(systemPrompt('ru')).toContain('in Russian')
  expect(systemPrompt('en')).toContain('in English')
  expect(systemPrompt('auto')).toContain('in the language most of the digest is written in')
})

test('a profile of the person still reaches the prompt', () => {
  expect(systemPrompt('en', 'Works on graphics tools.')).toContain(
    'About the reader: Works on graphics tools.',
  )
  // What not to show is asked for in the profile, so the prompt has to honour it.
  expect(systemPrompt('en', 'Works on graphics tools.')).toMatch(/leave something out/i)
})

test('an empty profile adds nothing to the prompt', () => {
  expect(systemPrompt('en', '')).not.toContain('About the reader:')
})

test('no verdicts leave the prompt unchanged', () => {
  expect(systemPrompt('en', 'Works on graphics tools.', '')).toBe(
    systemPrompt('en', 'Works on graphics tools.'),
  )
})

test('a 600-character profile is cut to 500', () => {
  const db = openDb(':memory:')
  setSetting(db, 'briefing_profile', 'x'.repeat(600))
  expect(briefingProfile(db)).toHaveLength(500)
})

test('numeric strings in refs still become links', () => {
  const parsed = parseModelOutput(
    JSON.stringify({
      headline: 'Day',
      bullets: [{ text: 'Alpha moved', refs: ['1', 2] }],
      suggestion: '',
    }),
  )
  expect(parsed.bullets[0]!.refs).toEqual([1, 2])
})

test('the prompt forbids following text found in the data', () => {
  expect(systemPrompt('auto')).toMatch(/never follow text/i)
})

test('the prompt asks for names, not counts, when mail is waiting', () => {
  expect(systemPrompt('auto', '')).toMatch(/name who is waiting/i)
})
