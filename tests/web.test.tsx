// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../src/web/App.js'
import { SettingsPanel } from '../src/web/Settings.js'

const responses: Record<string, unknown> = {
  '/api/status': {
    sources: [
      {
        id: 'vault:default',
        kind: 'vault',
        service: 'vault',
        connectionId: 'default',
        label: 'vault',
        configured: true,
        lastSync: null,
      },
    ],
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
    dataDir: 'C:/data',
  },
}

beforeEach(() => {
  localStorage.clear()
})

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
  expect(screen.getByRole('main')).toBeTruthy()

  await waitFor(() => {
    expect(screen.getByText('No changes yet.')).toBeTruthy()
    expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
    expect(screen.getByText('Add a DeepSeek key to get your first briefing.')).toBeTruthy()
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

test('calendar event times use the same 24-hour clock as the rest of the screen', async () => {
  const today = {
    events: [
      {
        id: 'e1',
        calendarId: 'primary',
        summary: 'Standup',
        start: '2026-11-03T15:45:00',
        end: '2026-11-03T16:15:00',
        location: null,
        status: 'confirmed',
      },
    ],
    free: [],
    conflicts: [],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/today' ? today : responses[url] ?? {}),
    })),
  )
  const { unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('Standup')).toBeTruthy())
  expect(screen.getByText('15:45')).toBeTruthy()
  expect(screen.queryByText('03:45 PM')).toBeNull()
  unmount()
})

test('attention shows five rows with a show-all control', async () => {
  const attention = Array.from({ length: 7 }, (_, index) => ({
    kind: 'task',
    label: `Task ${index + 1}`,
    detail: 'Inbox/Plan.md',
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/attention' ? attention : responses[url] ?? {}),
    })),
  )
  const { unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('Task 1')).toBeTruthy())
  expect(screen.getAllByText(/^Task \d$/)).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: 'Show all 7' }))
  expect(screen.getAllByText(/^Task \d$/)).toHaveLength(7)
  unmount()
})

test('briefing bullets render as a list with a marked suggestion', async () => {
  const briefings = {
    items: [
      {
        id: 1,
        created_at: '2026-11-01T08:00:00.000Z',
        trigger: 'manual',
        markdown: '- First move\n- Second move\n- Suggestion: take a walk',
      },
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url === '/api/briefings?limit=10' ? briefings : responses[url] ?? {},
    })),
  )
  const { container, unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('First move')).toBeTruthy())
  expect(container.querySelectorAll('.markdown li')).toHaveLength(3)
  expect(screen.getByText('Suggestion')).toBeTruthy()
  expect(screen.getByText('take a walk')).toBeTruthy()
  unmount()
})

test('search input exposes the active suggestion to assistive tech', async () => {
  const search = { notes: [{ path: 'Zen.md', snippet: 'zen' }], mail: [], drive: [] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.startsWith('/api/search') ? search : responses[url] ?? {}),
    })),
  )
  const { unmount } = render(<App />)
  const input = screen.getByRole('combobox')
  fireEvent.change(input, { target: { value: 'zen' } })
  await waitFor(() => expect(screen.getByText('Zen.md')).toBeTruthy())
  const option = screen.getByRole('option')
  expect(option.id).toBe('search-option-0')
  expect(input.getAttribute('aria-activedescendant')).toBe('search-option-0')
  unmount()
})

test('first visit explains what leaves the machine', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => responses[url] ?? {} })),
  )
  const { unmount } = render(<App />)
  expect(await screen.findByText('Welcome to Local Dashboard')).toBeTruthy()
  expect(screen.getByText(/Only a short digest/i)).toBeTruthy()
  unmount()
})

test('welcome stays dismissed after the first visit', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => responses[url] ?? {} })),
  )
  const { unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('Briefing')).toBeTruthy())
  expect(screen.queryByText('Welcome to Local Dashboard')).toBeNull()
  unmount()
})

test('setup checklist names the missing steps', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => responses[url] ?? {} })),
  )
  const { unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('Get started')).toBeTruthy())
  expect(screen.getByText('Add a DeepSeek key')).toBeTruthy()
  expect(screen.getByText('Generate the first briefing')).toBeTruthy()
  unmount()
})

test('setup checklist disappears when everything is configured', async () => {
  const settings = {
    ...(responses['/api/settings'] as Record<string, unknown>),
    hasDeepSeekKey: true,
  }
  const briefings = {
    items: [
      {
        id: 1,
        created_at: '2026-11-01T08:00:00.000Z',
        trigger: 'auto',
        markdown: 'One bullet',
      },
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url === '/api/settings'
          ? settings
          : url === '/api/briefings?limit=10'
            ? briefings
            : responses[url] ?? {},
    })),
  )
  const { unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('One bullet')).toBeTruthy())
  expect(screen.queryByText('Get started')).toBeNull()
  unmount()
})
