import { expect, test } from '@playwright/test'
import { addConnection, clearConnections, dismissWelcome, openSettings, toggleCheckbox } from './helpers.js'

test.describe('local only', () => {
  test.beforeEach(async ({ page, request }) => {
    await dismissWelcome(page)
    await clearConnections(request)
  })

  test('disables connection test buttons and OAuth links', async ({ page, request }) => {
    await addConnection(request, {
      service: 'google',
      label: 'Google',
      config: { clientId: 'test-client-id' },
    })

    await page.goto('/')
    await openSettings(page)

    const oauth = page.locator('a[href^="/api/oauth/google/start"]')
    await expect(oauth).toBeVisible()

    await toggleCheckbox(page.locator('#pref-local-only'))
    await expect(page.locator('#pref-local-only')).toBeChecked()

    await expect(page.getByRole('button', { name: 'Test' })).toBeDisabled()
    await expect(oauth).toHaveCount(0)
    await expect(page.locator('span.is-disabled', { hasText: 'Connect' })).toBeVisible()
  })

  test('with a DeepSeek key writes a rules briefing without any egress', async ({ page, request }) => {
    await addConnection(request, {
      service: 'deepseek',
      label: 'DeepSeek',
      config: {},
      secret: { key: 'sk-fake-key' },
    })
    await request.put('http://127.0.0.1:4318/api/settings', { data: { localOnly: true } })

    let deepseekRequests = 0
    await page.route('https://api.deepseek.com/**', (route) => {
      deepseekRequests++
      void route.abort()
    })

    await page.goto('/')
    await page.getByRole('button', { name: /briefing now|refresh/i }).click()

    await expect(page.getByText('Quiet day')).toBeVisible()
    await expect(page.locator('.briefing__stamp').filter({ hasText: 'rules' })).toBeVisible()
    expect(deepseekRequests).toBe(0)
  })
})
