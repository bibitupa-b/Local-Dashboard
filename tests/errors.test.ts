import { expect, test } from 'vitest'
import { friendlyError } from '../src/web/errors.js'

test('DeepSeek balance errors tell the user what to do', () => {
  expect(friendlyError('DeepSeek responded 402')).toContain('balance')
  expect(friendlyError('DeepSeek responded 402')).toContain('platform.deepseek.com')
})

test('expired Google access asks for a reconnect', () => {
  expect(friendlyError('invalid_grant: Token has been expired or revoked')).toContain('Reconnect')
  expect(friendlyError('DeepSeek responded 401')).toContain('Settings')
})

test('mail authentication failures point at the app password', () => {
  expect(friendlyError('AUTHENTICATIONFAILED Invalid login')).toContain('app password')
})

test('network failures are explained in plain words', () => {
  expect(friendlyError('fetch failed')).toContain('network')
})

test('unknown errors are passed through unchanged', () => {
  expect(friendlyError('something odd happened')).toBe('something odd happened')
})
