import { expect, test } from 'vitest'
import { contentLang } from '../src/web/lang.js'

test('user content declares the language of its own text', () => {
  expect(contentLang('- Утро: три письма\n- Предложение: ответить на два')).toBe('ru')
  expect(contentLang('- Three notes changed\n- Suggestion: answer the two replies')).toBeUndefined()
  expect(contentLang('')).toBeUndefined()
})
