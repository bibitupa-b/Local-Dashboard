import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

/** API requests go to the web server directly; baseURL is baked in so paths stay relative. */
const BASE = 'http://127.0.0.1:4318'

export type ConnectionInput = {
  service: string
  label: string
  config?: Record<string, string>
  secret?: Record<string, string>
  enabled?: boolean
}

export async function listConnections(request: APIRequestContext): Promise<
  Array<{ id: string; service: string; label: string; enabled: boolean }>
> {
  const res = await request.get(`${BASE}/api/connections`)
  const body = (await res.json()) as { items: Array<{ id: string; service: string; label: string; enabled: boolean }> }
  return body.items
}

export async function addConnection(
  request: APIRequestContext,
  input: ConnectionInput,
): Promise<{ id: string; service: string }> {
  const res = await request.post(`${BASE}/api/connections`, { data: input })
  if (!res.ok()) throw new Error(`addConnection failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

/** Removes every connection so the source rail is empty. */
export async function clearConnections(request: APIRequestContext): Promise<void> {
  for (const connection of await listConnections(request)) {
    await request.delete(`${BASE}/api/connections/${connection.id}`)
  }
}

/**
 * A fresh server seeds a vault + browser connection and, once its startup sync finishes, writes a
 * one-shot "Quiet day" catch-up briefing. For a visual baseline we need neither: wait for that
 * briefing to land, then wipe data and connections. This only runs in `test:visual`, a single-test
 * invocation, so the catch-up briefing is still there to be waited for.
 */
export async function resetToZeroState(request: APIRequestContext): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await request.get(`${BASE}/api/briefings?limit=10`)
        const body = (await res.json()) as { items: unknown[] }
        return body.items.length
      },
      { timeout: 15_000, message: 'startup briefing did not appear' },
    )
    .toBeGreaterThan(0)
  await request.delete(`${BASE}/api/data`)
  await clearConnections(request)
}

export async function dismissWelcome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('dashboard.welcomed', '1')
    } catch {
      // private mode: welcome returns, which only matters to a first-run human
    }
  })
}

export async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
}

/** Scopes a `.conn-group` block to the service heading inside it. */
export function serviceGroup(page: Page, name: string) {
  return page
    .locator('.conn-group')
    .filter({ has: page.getByRole('heading', { name: new RegExp(`^${name}`) }) })
}

/** The native checkbox is a 1px, pointer-events:none input; the `.check` label is what is clicked. */
export async function toggleCheckbox(input: Locator): Promise<void> {
  await input.locator('xpath=..').click()
}
