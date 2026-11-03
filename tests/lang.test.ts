import { expect, test } from 'vitest'
import { briefingLang } from '../src/web/lang.js'

test('the briefing declares the language of its own text', () => {
  expect(briefingLang('- Утро: три письма\n- Предложение: ответить на два')).toBe('ru')
  expect(briefingLang('- Three notes changed\n- Suggestion: answer the two replies')).toBeUndefined()
  expect(briefingLang('')).toBeUndefined()
})
