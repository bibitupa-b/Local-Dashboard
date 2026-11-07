import { expect, test } from '@playwright/test'
import { dismissWelcome, openSettings, resetToZeroState } from './helpers.js'

test.use({
  timezoneId: 'UTC',
  reducedMotion: 'reduce',
})

test.describe('visual regression', () => {
  test.beforeEach(async ({ page, request }) => {
    await dismissWelcome(page)
    await page.addInitScript(() => {
      const style = document.createElement('style')
      style.textContent =
        '*, *::before, *::after { animation: none !important; transition: none !important; }'
      ;(document.head ?? document.documentElement).appendChild(style)
    })
    // A fixed instant keeps the topbar/hero/today dates from drifting between runs.
    await page.clock.install({ time: new Date('2026-11-07T12:00:00Z') })
    await resetToZeroState(request)
  })

  test('dashboard, settings and search overlay at 1440x900', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Everything is optional' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('dashboard.png', { maxDiffPixelRatio: 0.01 })

    await openSettings(page)
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('settings.png', { maxDiffPixelRatio: 0.01 })

    await page.getByRole('button', { name: 'Back to dashboard' }).click()
    await expect(page.getByRole('region', { name: 'Everything is optional' })).toBeVisible()
    const search = page.getByRole('combobox', { name: 'Search notes, mail and Drive' })
    await search.fill('test')
    await search.press('Enter')
    await expect(page.locator('.search-overlay')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('search.png', { maxDiffPixelRatio: 0.01 })
  })
})
