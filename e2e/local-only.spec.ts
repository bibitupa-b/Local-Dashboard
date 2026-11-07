import { expect, test } from '@playwright/test'
import { addConnection, dismissWelcome, openSettings, resetServerState, toggleCheckbox } from './helpers.js'

test.describe('local only', () => {
  test.beforeEach(async ({ page, request }) => {
    await dismissWelcome(page)
    await resetServerState(request)
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

    await page.goto('/')
    await page.getByRole('button', { name: /briefing now|refresh/i }).click()

    // The briefing call is made server-side, so a browser route can't observe it. The real proof of
    // no egress is that local-only short-circuits to the deterministic rules path: a "Quiet day"
    // headline and the "· rules" stamp (digest_meta.model === 'rules'), never a deepseek-flash result.
    await expect(page.getByText('Quiet day')).toBeVisible()
    await expect(page.locator('.briefing__stamp').filter({ hasText: 'rules' })).toBeVisible()
  })
})
