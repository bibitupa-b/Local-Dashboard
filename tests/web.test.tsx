// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../src/web/App.js'
import { SettingsPanel } from '../src/web/Settings.js'

const responses: Record<string, unknown> = {
  '/api/status': {
    sources: [{ id: 'vault', configured: true, lastSync: null }],
    briefingToday: false,
    sync: { running: false, source: null, sourceIndex: 0, sourceTotal: 0, done: 0, total: 0 },
  },
  '/api/feed?days=7': { days: [] },
  '/api/attention': [],
  '/api/briefings?limit=10': { items: [] },
  '/api/today': { events: [], free: [], conflicts: [] },
  '/api/settings': {
    vaultPath: 'C:/notes',
    briefingHour: 8,
    hasDeepSeekKey: false,
    googleConfigured: false,
    driveConnected: false,
    mailConfigured: false,
    mailConnected: false,
    calendarConnected: false,
    excludedSenders: [],
    excludedMailFolders: [],
    excludedVaultPrefixes: [],
    excludedBrowserDomains: [],
    browserConfigured: false,
    githubConfigured: false,
    githubConnected: false,
    digestWindowHours: 24,
    enabledSources: [],
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders the three blocks and their empty states', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => responses[url] })),
  )
  const { unmount } = render(<App />)

  expect(screen.getByText('Briefing')).toBeTruthy()
  expect(screen.getByText('Activity')).toBeTruthy()
  expect(screen.getByText('Needs attention')).toBeTruthy()

  await waitFor(() => {
    expect(screen.getByText('No changes yet.')).toBeTruthy()
    expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
    expect(screen.getByText('No briefing yet. Generate one whenever you are ready.')).toBeTruthy()
  })

  unmount()
})

test('disconnect asks for confirmation in a dialog', async () => {
  const connection = {
    id: 'vault-1',
    service: 'vault',
    label: 'Main vault',
    config: { path: 'C:/notes' },
    enabled: true,
    lastError: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    secretsSet: [],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url === '/api/connections') return { items: [connection] }
        if (url === '/api/connections/vault-1') return { ok: true }
        return responses[url] ?? {}
      },
    })),
  )

  const { unmount } = render(
    <SettingsPanel
      settings={responses['/api/settings'] as never}
      onSaved={() => {}}
      onClose={() => {}}
    />,
  )

  await waitFor(() => expect(screen.getByText('Main vault')).toBeTruthy())
  expect(screen.getAllByRole('note')[0]?.getAttribute('aria-describedby')).toBeTruthy()

  const disconnect = screen
    .getAllByRole('button', { name: 'Disconnect' })
    .at(-1) as HTMLButtonElement
  disconnect.click()

  await waitFor(() => expect(screen.getByText('Disconnect account')).toBeTruthy())
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  cancel.click()
  await waitFor(() => expect(screen.queryByText('Disconnect account')).toBeNull())
  unmount()
})

test('every empty service offers a connect button', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url === '/api/connections' ? { items: [] } : responses[url] ?? {},
    })),
  )

  const { unmount } = render(
    <SettingsPanel
      settings={responses['/api/settings'] as never}
      onSaved={() => {}}
      onClose={() => {}}
    />,
  )

  await waitFor(() => {
    expect(screen.getAllByText('Connect').length).toBeGreaterThanOrEqual(6)
  })
  expect(screen.getByText('DeepSeek API')).toBeTruthy()
  unmount()
})
