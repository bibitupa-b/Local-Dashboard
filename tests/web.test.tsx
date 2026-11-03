// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  cleanup()
  vi.unstubAllGlobals()
})

test('renders the briefing, the services line and their empty states', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => responses[url] })),
  )
  const { container, unmount } = render(<App />)

  expect(screen.getByText('Briefing')).toBeTruthy()
  expect(screen.getByRole('main')).toBeTruthy()

  await waitFor(() => {
    expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
    expect(screen.getByText('Add a DeepSeek key to get your first briefing.')).toBeTruthy()
    expect(container.querySelector('.station')?.getAttribute('title')).toBe(
      'Waiting for the first sync',
    )
  })

  expect(container.querySelectorAll('.station')).toHaveLength(1)
  expect(screen.queryByText('Activity')).toBeNull()
  expect(screen.queryByText('Needs attention')).toBeNull()

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

test('attention shows only the pile to start with, not the whole backlog', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const attention = [
    { kind: 'task', label: 'Task 1', detail: 'Inbox/Plan.md' },
    {
      kind: 'reply',
      label: '88 awaiting your reply',
      detail: 'Ozon, Reddit',
      count: 88,
    },
    { kind: 'mail', label: 'Mail: 90 unread', detail: '3 starred', count: 90 },
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/attention' ? attention : responses[url] ?? {}),
    })),
  )
  const { unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('awaiting your reply')).toBeTruthy())
  expect(screen.getByText('88')).toBeTruthy()
  expect(screen.getByText('Ozon, Reddit')).toBeTruthy()
  expect(screen.queryByText('Task 1')).toBeNull()
  expect(screen.queryByText(/unread/)).toBeNull()
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
