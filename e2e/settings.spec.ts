import { expect, test } from '@playwright/test'
import { clearConnections, dismissWelcome, listConnections, openSettings, serviceGroup, toggleCheckbox } from './helpers.js'

test.describe('settings connections', () => {
  test.beforeEach(async ({ page, request }) => {
    await dismissWelcome(page)
    await clearConnections(request)
  })

  test('add, disable and remove a Weather connection', async ({ page, request }) => {
    await page.goto('/')
    await openSettings(page)

    const weather = serviceGroup(page, 'Weather')
    await weather.getByRole('button', { name: 'Connect' }).click()

    const form = page.getByRole('dialog', { name: 'Connect Weather' })
    await form.getByLabel('Latitude').fill('55.7558')
    await form.getByLabel('Longitude').fill('37.6173')
    await form.getByRole('button', { name: 'Add connection' }).click()

    // The coordinates are the row's detail line, so they prove the connection landed.
    await expect(weather.getByText('55.7558, 37.6173')).toBeVisible()

    // Disable through the edit dialog.
    await weather.getByRole('button', { name: 'Edit' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit connection' })
    await toggleCheckbox(edit.getByRole('checkbox', { name: 'Enabled' }))
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(edit).toBeHidden()

    const saved = (await listConnections(request)).find((row) => row.service === 'weather')
    expect(saved?.enabled).toBe(false)

    // Remove through the confirm dialog.
    await weather.getByRole('button', { name: 'Disconnect' }).click()
    const confirm = page.getByRole('dialog', { name: 'Disconnect account' })
    await confirm.getByRole('button', { name: 'Disconnect' }).click()

    await expect(weather.getByText('55.7558, 37.6173')).toHaveCount(0)
    expect((await listConnections(request)).some((row) => row.service === 'weather')).toBe(false)
  })
})
