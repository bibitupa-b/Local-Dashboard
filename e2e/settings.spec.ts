import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { dismissWelcome, listConnections, openSettings, resetServerState, serviceGroup, toggleCheckbox } from './helpers.js'

test.describe('settings connections', () => {
  test.beforeEach(async ({ page, request }) => {
    await dismissWelcome(page)
    await resetServerState(request)
  })

  test('add, disable and remove a Vault connection', async ({ page, request }) => {
    // A local-only source: an empty temp vault syncs instantly and never touches the network,
    // so the add flow is deterministic offline (unlike Weather, which calls Open-Meteo).
    const vaultDir = mkdtempSync(join(tmpdir(), 'ld-vault-'))
    try {
      await page.goto('/')
      await openSettings(page)

      const vault = serviceGroup(page, 'Obsidian vault')
      await vault.getByRole('button', { name: 'Connect' }).click()

      const form = page.getByRole('dialog', { name: 'Connect Obsidian vault' })
      await form.getByLabel('Vault folder').fill(vaultDir)
      await form.getByRole('button', { name: 'Add connection' }).click()

      // The folder path is the row's detail line, so it proves the connection landed.
      await expect(vault.getByText(vaultDir)).toBeVisible()

      // Disable through the edit dialog.
      await vault.getByRole('button', { name: 'Edit' }).click()
      const edit = page.getByRole('dialog', { name: 'Edit connection' })
      await toggleCheckbox(edit.getByRole('checkbox', { name: 'Enabled' }))
      await edit.getByRole('button', { name: 'Save changes' }).click()
      await expect(edit).toBeHidden()

      const saved = (await listConnections(request)).find((row) => row.service === 'vault')
      expect(saved?.enabled).toBe(false)

      // Remove through the confirm dialog.
      await vault.getByRole('button', { name: 'Disconnect' }).click()
      const confirm = page.getByRole('dialog', { name: 'Disconnect account' })
      await confirm.getByRole('button', { name: 'Disconnect' }).click()

      await expect(vault.getByText(vaultDir)).toHaveCount(0)
      expect((await listConnections(request)).some((row) => row.service === 'vault')).toBe(false)
    } finally {
      rmSync(vaultDir, { recursive: true, force: true })
    }
  })
})
