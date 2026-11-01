// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../src/web/App.js'

const responses: Record<string, unknown> = {
  '/api/status': {
    sources: [{ id: 'vault', configured: true, lastSync: null }],
    briefingToday: false,
    sync: { running: false, source: null, sourceIndex: 0, sourceTotal: 0, done: 0, total: 0 },
  },
  '/api/feed?days=7': { days: [] },
  '/api/attention': [],
  '/api/briefings?limit=10': { items: [] },
  '/api/today': { events: [] },
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
