import { expect, test } from 'vitest'
import { driveUrl, mailUrl, obsidianUrl, sourceUrl, vaultName } from '../src/web/links.js'

const vault = 'C:\\Users\\ivans\\Documents\\Main Obsidian Vault'

test('vault name and obsidian links', () => {
  expect(vaultName(vault)).toBe('Main Obsidian Vault')
  expect(obsidianUrl(vault)).toBe('obsidian://open?vault=Main%20Obsidian%20Vault')
  expect(obsidianUrl(vault, '01 Projects/Alpha.md')).toBe(
    'obsidian://open?vault=Main%20Obsidian%20Vault&file=01%20Projects%2FAlpha',
  )
})

test('mail links prefer the message id and fall back to the subject', () => {
  expect(mailUrl('<abc@mail>', 'ignored')).toContain(encodeURIComponent('rfc822msgid:<abc@mail>'))
  expect(mailUrl(null, 'Quarterly plan')).toContain(encodeURIComponent('Quarterly plan'))
})

test('drive links point at the file, sources at their service', () => {
  expect(driveUrl('f1')).toBe('https://drive.google.com/file/d/f1/view')
  expect(sourceUrl('mail', vault)).toBe('https://mail.google.com')
  expect(sourceUrl('vault', vault)).toContain('obsidian://open')
  expect(sourceUrl('browser', vault)).toBeNull()
})
