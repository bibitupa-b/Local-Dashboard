import { expect, test } from '@playwright/test'
import { dismissWelcome, resetServerState } from './helpers.js'

test.describe('zero connections', () => {
  test.beforeEach(async ({ page, request }) => {
    await dismissWelcome(page)
    await resetServerState(request)
  })

  test('shows the optional card and writes a rules briefing', async ({ page }) => {
    await page.goto('/')

    const card = page.getByRole('region', { name: 'Everything is optional' })
    await expect(card).toBeVisible()
    await expect(card.getByText(/uses local rules/i)).toBeVisible()

    await card.getByRole('button', { name: 'Dismiss' }).click()
    await expect(card).toBeHidden()

    await page.getByRole('button', { name: /briefing now|refresh/i }).click()
    await expect(page.getByText('Quiet day')).toBeVisible()
  })
})
