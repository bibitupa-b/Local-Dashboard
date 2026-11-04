// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
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
  disconnect.focus()
  disconnect.click()

  await waitFor(() => expect(screen.getByText('Disconnect account')).toBeTruthy())
  const dialog = screen.getByRole('dialog')
  // The consequence, not only the title, reaches whoever hears the dialog open.
  expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toContain(
    'Main vault',
  )
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  expect(document.activeElement).toBe(cancel)
  const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect' })
  confirm.focus()
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(document.activeElement).toBe(cancel)
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(confirm)
  cancel.click()
  await waitFor(() => expect(screen.queryByText('Disconnect account')).toBeNull())
  // The trap hands focus back to the row that opened it.
  expect(document.activeElement).toBe(disconnect)
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

test('a structured briefing leads with its headline and opens its sources', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const briefings = {
    items: [
      {
        id: 3,
        created_at: '2026-11-04T08:00:00.000Z',
        trigger: 'auto',
        markdown: 'Quiet day\n- Alpha moved\nSuggestion: Open Alpha',
        body: {
          headline: 'Quiet day',
          bullets: [
            {
              text: 'Alpha moved',
              refs: [
                { kind: 'note', label: 'Alpha', path: '01 Projects/Alpha.md' },
                { kind: 'browser', label: '3 visits today' },
              ],
            },
          ],
          suggestion: 'Open Alpha',
        },
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
  await waitFor(() => expect(screen.getByText('Quiet day')).toBeTruthy())
  expect(container.querySelector('.markdown .headline')?.textContent).toBe('Quiet day')
  expect(container.querySelectorAll('.markdown .line')).toHaveLength(2)
  const note = screen.getByRole('link', { name: 'Alpha' })
  expect(note.getAttribute('href')).toBe('obsidian://open?vault=notes&file=01%20Projects%2FAlpha')
  // A point with nowhere to go is still named, just not a link.
  expect(screen.getByText('3 visits today').closest('a')).toBeNull()
  expect(screen.getByText('Suggestion')).toBeTruthy()
  expect(screen.getByText('Open Alpha')).toBeTruthy()
  unmount()
})

test('the stamp names the trigger and the window it covers', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const briefings = {
    items: [
      {
        id: 5,
        created_at: '2026-11-04T08:00:00.000Z',
        trigger: 'auto',
        markdown: '- one',
        body: null,
        digest_meta: { since: '2026-10-28T08:00:00.000Z', until: '2026-11-04T08:00:00.000Z' },
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
  await waitFor(() => expect(screen.getByText('one')).toBeTruthy())
  expect(container.querySelector('.stamp')?.textContent).toContain('auto · 7 d')
  unmount()
})

test('a briefing can be marked useful or miss and keeps the verdict', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const item = {
    id: 9,
    created_at: '2026-11-04T08:00:00.000Z',
    trigger: 'auto',
    markdown: '- one',
    body: null,
    feedback: null as string | null,
  }
  const posts: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/briefings/9/feedback' && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        item.feedback = 'useful'
        return { ok: true, json: async () => ({ ok: true }) }
      }
      return {
        ok: true,
        json: async () =>
          url === '/api/briefings?limit=10'
            ? { items: [{ ...item }] }
            : responses[url] ?? {},
      }
    }),
  )
  const { unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('one')).toBeTruthy())

  const useful = screen.getByRole('button', { name: 'Useful' })
  const miss = screen.getByRole('button', { name: 'Miss' })
  expect(useful.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(useful)
  await waitFor(() => expect(useful.getAttribute('aria-pressed')).toBe('true'))
  expect(miss.getAttribute('aria-pressed')).toBe('false')
  expect(posts).toEqual([{ value: 'useful' }])

  // A fresh load reads the verdict back from the list: it survives the reload.
  unmount()
  const second = render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Useful' }).getAttribute('aria-pressed')).toBe(
      'true',
    ),
  )
  second.unmount()
})

test('a failed generation is named on the page in Clay, with no retry button', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const status = {
    ...(responses['/api/status'] as Record<string, unknown>),
    briefingError: { at: '2026-11-04T05:00:00.000Z', message: 'DeepSeek responded 429' },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/status' ? status : responses[url] ?? {}),
    })),
  )
  const { container, unmount } = render(<App />)

  const line = await screen.findByText(/Briefing failed at \d{2}:\d{2}: Too many requests\./)
  expect(line.className).toContain('failed')
  expect(container.querySelector('.stamp.failed button')).toBeNull()
  unmount()
})

test('a briefing that mixes bullets and plain lines stays one list without raw markers', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const briefings = {
    items: [
      {
        id: 1,
        created_at: '2026-11-01T08:00:00.000Z',
        trigger: 'auto',
        markdown: 'Vault moved\n- Second move\nSuggestion: take a walk',
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
  await waitFor(() => expect(screen.getByText('Second move')).toBeTruthy())
  expect(container.querySelectorAll('.markdown li')).toHaveLength(3)
  expect(container.querySelector('.markdown ul')?.textContent).not.toContain('- Second')
  expect(screen.getByText('Suggestion')).toBeTruthy()
  expect(screen.getByText('take a walk')).toBeTruthy()
  unmount()
})

test('the reading rule re-attaches after the settings route rebuilds the page', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
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
        url === '/api/connections'
          ? { items: [] }
          : url === '/api/briefings?limit=10'
            ? briefings
            : responses[url] ?? {},
    })),
  )
  const observed: Element[] = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = (node: Element) => observed.push(node)
      disconnect = () => {}
      unobserve = () => {}
      takeRecords = () => []
    },
  )

  const { container, unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('First move')).toBeTruthy())
  expect(observed).toContain(container.querySelector('.line'))

  // The settings route unmounts the briefing: a stale observer would leave the tick dead.
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Back to dashboard' }))
  await waitFor(() => expect(container.querySelector('.line')).toBeTruthy())
  expect(observed.at(-1) && container.contains(observed.at(-1)!)).toBe(true)
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
  // Pressing elsewhere closes the popup; it must not sit over the briefing while reading.
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('option')).toBeNull()
  // Leaving the field with the keyboard closes it too.
  fireEvent.change(input, { target: { value: 'zeno' } })
  await waitFor(() => expect(screen.getByRole('option')).toBeTruthy())
  fireEvent.blur(input)
  expect(screen.queryByRole('option')).toBeNull()
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
  expect(screen.getByText(/one line from an old note/i)).toBeTruthy()
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

test('the welcome dialog plays its exit before it unmounts', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => responses[url] ?? {} })),
  )
  const { container, unmount } = render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Explore first' }))

  const backdrop = container.querySelector('.modal-backdrop')
  expect(backdrop?.className).toContain('leaving')
  await waitFor(() => expect(container.querySelector('.modal-backdrop')).toBeNull())
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

test('first visit puts focus in the welcome dialog, traps Tab and closes on Escape', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => responses[url] ?? {} })),
  )
  const { unmount } = render(<App />)

  const primary = await screen.findByRole('button', { name: 'Set up sources' })
  expect(document.activeElement).toBe(primary)

  const last = screen.getByRole('button', { name: 'Explore first' })
  last.focus()
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(document.activeElement).toBe(primary)

  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByText('Welcome to Local Dashboard')).toBeNull())
  expect(localStorage.getItem('dashboard.welcomed')).toBe('1')
  unmount()
})

test('the first-run dialog keeps stray focus and page shortcuts out of the page', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ ok: true, json: async () => responses[url] ?? {} })),
  )
  const { unmount } = render(<App />)

  const primary = await screen.findByRole('button', { name: 'Set up sources' })
  // Clicking the dialog's own text drops focus to <body>: Tab must come back in, not move on.
  ;(document.activeElement as HTMLElement | null)?.blur()
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(document.activeElement).toBe(primary)

  // `/` and `b` belong to the page, and the page is behind the dialog.
  fireEvent.keyDown(window, { key: '/' })
  expect(document.activeElement).not.toBe(screen.getByRole('combobox'))
  fireEvent.keyDown(window, { key: 'b' })
  expect(fetch).not.toHaveBeenCalledWith('/api/briefings/generate', expect.anything())

  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

  fireEvent.keyDown(window, { key: '/' })
  expect(document.activeElement).toBe(screen.getByRole('combobox'))
  unmount()
})

test('the rail is the progressbar and the stations stay links while syncing', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const status = {
    ...(responses['/api/status'] as Record<string, unknown>),
    sync: {
      running: true,
      source: 'vault:default',
      sourceIndex: 0,
      sourceTotal: 1,
      done: 0,
      total: 4,
    },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/status' ? status : responses[url] ?? {}),
    })),
  )
  const { container, unmount } = render(<App />)

  const bar = await screen.findByRole('progressbar')
  expect(bar.tagName).toBe('SPAN')
  expect(bar.getAttribute('aria-valuenow')).toBe('0')
  expect(bar.getAttribute('aria-label')).toBe('Syncing vault')
  expect(container.querySelector('.network')?.hasAttribute('role')).toBe(false)
  expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
  unmount()
})

test('a station is named by its service, its state and where it goes', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const sync = { running: false, source: null, sourceIndex: 0, sourceTotal: 0, done: 0, total: 0 }
  const source = (id: string, kind: string, service: string, extra: Record<string, unknown> = {}) =>
    ({ id, kind, service, connectionId: 'default', label: kind, configured: true, lastSync: null, ...extra })
  const status = {
    ...(responses['/api/status'] as Record<string, unknown>),
    sync,
    sources: [
      source('vault:default', 'vault', 'vault', { lastSync: '2026-11-03T08:12:00.000Z' }),
      source('drive:a', 'drive', 'google', { connectionId: 'a', lastSync: '2026-11-03T08:12:00.000Z' }),
      source('drive:b', 'drive', 'google', { connectionId: 'b', lastSync: '2026-11-03T08:12:00.000Z' }),
      source('mail:default', 'mail', 'imap', { lastError: '401 invalid_grant' }),
      source('github:default', 'github', 'github', { configured: false }),
      source('browser:default', 'browser', 'browser', { lastSync: '2026-11-03T08:12:00.000Z' }),
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/status' ? status : responses[url] ?? {}),
    })),
  )
  const { container, unmount } = render(<App />)

  // Each link says the state and the destination, once: the visible time is not read twice.
  expect(
    await screen.findByRole('link', {
      name: /^drive, 2 accounts, Last synced \d{2}:\d{2}, opens in Google Drive$/,
    }),
  ).toBeTruthy()
  expect(screen.getByRole('link', { name: /^vault, Last synced .+, opens in Obsidian$/ })).toBeTruthy()
  expect(
    screen.getByRole('link', { name: /^mail, Access expired or was revoked\..+, opens in Gmail$/ }),
  ).toBeTruthy()
  expect(
    screen.getByRole('link', { name: 'github, Not connected, opens GitHub notifications' }),
  ).toBeTruthy()

  // The browser station has nowhere to go: it is a named row, not a nameless link.
  const browser = container.querySelector('.station.browser') as HTMLElement
  expect(browser.tagName).toBe('SPAN')
  expect(browser.textContent).toMatch(/browser.*Last synced/)
  expect(screen.queryByRole('link', { name: /^browser/ })).toBeNull()
  unmount()
})

test('a repeated briefing shortcut spends once', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  let calls = 0
  let finish = () => {}
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/briefings/generate') {
        calls++
        await pending
        return { ok: true, json: async () => ({ markdown: '- A fresh point' }) }
      }
      return { ok: true, json: async () => responses[url] ?? {} }
    }),
  )
  const { unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('Briefing')).toBeTruthy())

  // A held key repeats keydown; the second press must not spend again.
  fireEvent.keyDown(window, { key: 'b' })
  fireEvent.keyDown(window, { key: 'b' })
  await waitFor(() => expect(calls).toBe(1))

  finish()
  await waitFor(() => expect(screen.getByText('A fresh point')).toBeTruthy())
  unmount()
})

test('briefing ready and a finished search are announced, not only drawn', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const search = { notes: [{ path: 'Zen.md', snippet: 'zen' }], mail: [], drive: [] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url === '/api/briefings/generate') return { markdown: '- A fresh point' }
        if (url.startsWith('/api/search')) return search
        return responses[url] ?? {}
      },
    })),
  )
  const { container, unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('Nothing needs attention.')).toBeTruthy())
  const region = container.querySelector('.sr-only[role="status"]') as HTMLElement

  fireEvent.click(screen.getByRole('button', { name: 'Briefing now' }))
  await waitFor(() => expect(region.textContent).toMatch(/^Briefing ready at \d{2}:\d{2}\.$/))

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zen' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() => expect(region.textContent).toBe('One result for zen.'))
  unmount()
})

test('the settings route keeps its dialogs out of the main landmark', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
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
      json: async () => (url === '/api/connections' ? { items: [connection] } : responses[url] ?? {}),
    })),
  )
  const { unmount } = render(<App />)

  const settings = await screen.findByRole('button', { name: 'Settings' })
  await waitFor(() => expect(settings.hasAttribute('disabled')).toBe(false))
  settings.click()

  const main = await screen.findByRole('main')
  expect(screen.getAllByRole('main')).toHaveLength(1)
  await waitFor(() => expect(screen.getByText('Main vault')).toBeTruthy())
  fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' }).at(-1)!)

  const dialog = await screen.findByRole('dialog')
  expect(main.contains(dialog)).toBe(false)
  expect(dialog.closest('main')).toBeNull()
  unmount()
})

test('the settings route moves focus in and returns it on the way back', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/connections' ? { items: [] } : responses[url] ?? {}),
    })),
  )
  const { unmount } = render(<App />)

  const settings = await screen.findByRole('button', { name: 'Settings' })
  await waitFor(() => expect(settings.hasAttribute('disabled')).toBe(false))
  settings.click()

  const back = await screen.findByRole('button', { name: 'Back to dashboard' })
  await waitFor(() => expect(document.activeElement).toBe(back))

  back.click()
  const again = await screen.findByRole('button', { name: 'Settings' })
  await waitFor(() => expect(document.activeElement).toBe(again))
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
  expect(screen.queryByText('Suggestion')).toBeNull()
  expect(screen.queryByText('Get started')).toBeNull()
  unmount()
})

test('all-day events read as a day and unreadable dates never print “Invalid Date”', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const today = {
    events: [
      {
        id: 'all-day',
        calendarId: 'primary',
        summary: 'Конференция',
        start: '2026-11-02T22:00:00.000Z',
        end: '2026-11-03T22:00:00.000Z',
        location: null,
        status: 'confirmed',
      },
      {
        id: 'broken',
        calendarId: 'primary',
        summary: 'Broken event',
        start: 'not-a-date',
        end: 'not-a-date',
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
  await waitFor(() => expect(screen.getByText('Конференция')).toBeTruthy())
  expect(screen.getByText('All day')).toBeTruthy()
  expect(screen.queryByText('Invalid Date')).toBeNull()
  expect(screen.getByText('Broken event').closest('.event')?.textContent).toContain('—')
  unmount()
})

test('a crowded day is capped and says how many are left', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const today = {
    events: Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      calendarId: 'primary',
      summary: `Event ${i + 1}`,
      start: `2026-11-03T${String(9 + i).padStart(2, '0')}:00:00`,
      end: `2026-11-03T${String(9 + i).padStart(2, '0')}:30:00`,
      location: null,
      status: 'confirmed',
    })),
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
  const { container, unmount } = render(<App />)
  await waitFor(() => expect(screen.getByText('Event 1')).toBeTruthy())
  expect(container.querySelectorAll('.today .event')).toHaveLength(6)
  expect(screen.getByRole('link', { name: '+4 more today' })).toBeTruthy()
  expect(screen.queryByText('Event 7')).toBeNull()
  unmount()
})

test('the rail stops at 100 when the sync counters overshoot', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const status = {
    ...(responses['/api/status'] as Record<string, unknown>),
    sync: { running: true, source: 'vault:default', sourceIndex: 3, sourceTotal: 2, done: 9, total: 3 },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/status' ? status : responses[url] ?? {}),
    })),
  )
  const { unmount } = render(<App />)
  const bar = await screen.findByRole('progressbar')
  expect(bar.getAttribute('aria-valuenow')).toBe('100')
  unmount()
})

test('the rail stays empty at rest, whatever the last sync cursor says', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const status = {
    ...(responses['/api/status'] as Record<string, unknown>),
    sync: {
      running: false,
      source: null,
      sourceIndex: 3,
      sourceTotal: 6,
      done: 0,
      total: 0,
    },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/status' ? status : responses[url] ?? {}),
    })),
  )
  const { container, unmount } = render(<App />)
  await waitFor(() => expect(container.querySelector('.station')).toBeTruthy())
  const fill = container.querySelector('.network .rail i') as HTMLElement
  expect(fill.style.width).toBe('0%')
  expect(screen.queryByRole('progressbar')).toBeNull()
  unmount()
})

test('one failed endpoint leaves the rest of the page intact', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/today') throw new Error('fetch failed')
      return { ok: true, json: async () => responses[url] }
    }),
  )
  const { unmount } = render(<App />)
  expect(await screen.findByText(/today's calendar/)).toBeTruthy()
  expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
  expect(screen.getByText('Add a DeepSeek key to get your first briefing.')).toBeTruthy()
  expect(screen.queryByText('Calendar not connected')).toBeNull()
  unmount()
})

test('a failed first load offers a retry, and a later answer clears the banner', async () => {
  let down = true
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (down) throw new Error('fetch failed')
      return { ok: true, json: async () => responses[url] }
    }),
  )
  const { unmount } = render(<App />)
  const retry = await screen.findByRole('button', { name: 'Try again' })
  expect(screen.getByText(/No network connection/)).toBeTruthy()
  // No welcome dialog until its payload arrives: its buttons would do nothing.
  expect(screen.queryByRole('dialog')).toBeNull()

  down = false
  retry.click()
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull())
  expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
  unmount()
})

test('polling sleeps while the window is hidden and only runs fast while a sync is in flight', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  let syncRunning = false
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const body = responses[url] as Record<string, unknown>
      return {
        ok: true,
        json: async () =>
          url === '/api/status'
            ? { ...body, sync: { ...(body.sync as object), running: syncRunning } }
            : body,
      }
    }),
  )
  // State updates land on microtasks, timers on the clock: keep them apart and flush each.
  const flush = async () => {
    await act(async () => {
      for (let tick = 0; tick < 50; tick++) await Promise.resolve()
    })
  }
  const statusCalls = () => calls.filter((url) => url === '/api/status').length
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
    await flush()
  }

  vi.useFakeTimers()
  const { unmount } = render(<App />)
  await flush()
  expect(statusCalls()).toBe(1)

  // Hidden: neither the minute nor the 3-second timer reaches the server.
  setHidden(true)
  await advance(90_000)
  expect(statusCalls()).toBe(1)

  // Back in view: one refresh, then the quiet minute again — no 3-second poll at rest.
  setHidden(false)
  await flush()
  expect(statusCalls()).toBe(2)
  await advance(9_000)
  expect(statusCalls()).toBe(2)

  // A sync (noticed by a load) turns the fast poll on.
  syncRunning = true
  await advance(60_000)
  const atSync = statusCalls()
  await advance(9_000)
  expect(statusCalls() - atSync).toBeGreaterThanOrEqual(3)

  // And a running sync still stops paying for status once the window is hidden.
  setHidden(true)
  const beforeHide = statusCalls()
  await advance(9_000)
  expect(statusCalls()).toBe(beforeHide)

  unmount()
})

test('preferences save themselves, and a number out of range never leaves the field', async () => {
  const bodies: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/settings' && init?.method === 'PUT') {
        bodies.push(JSON.parse(String(init.body)))
        return { ok: true, json: async () => ({ ok: true }) }
      }
      return {
        ok: true,
        json: async () => (url === '/api/connections' ? { items: [] } : responses[url] ?? {}),
      }
    }),
  )
  const flush = async () => {
    await act(async () => {
      for (let tick = 0; tick < 50; tick++) await Promise.resolve()
    })
  }

  vi.useFakeTimers()
  const { unmount } = render(
    <SettingsPanel
      settings={responses['/api/settings'] as never}
      onSaved={() => {}}
      onClose={() => {}}
    />,
  )
  await flush()

  const hour = screen.getByLabelText('Briefing hour (0–23)')
  fireEvent.change(hour, { target: { value: '9' } })
  expect(bodies).toHaveLength(0)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  await flush()
  expect(bodies).toEqual([{ briefingHour: 9 }])
  expect(screen.getByText(/^Saved \d{2}:\d{2}$/)).toBeTruthy()

  // A cleared or out-of-range field is a hint, not a write.
  fireEvent.change(hour, { target: { value: '' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  await flush()
  expect(bodies).toHaveLength(1)
  expect(screen.getByText('0–23')).toBeTruthy()
  unmount()
})

test('a preference that did not save keeps the text and can be retried', async () => {
  let down = true
  const bodies: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/settings' && init?.method === 'PUT') {
        bodies.push(JSON.parse(String(init.body)))
        return down
          ? { ok: false, status: 500, json: async () => ({}) }
          : { ok: true, json: async () => ({ ok: true }) }
      }
      return {
        ok: true,
        json: async () => (url === '/api/connections' ? { items: [] } : responses[url] ?? {}),
      }
    }),
  )
  const flush = async () => {
    await act(async () => {
      for (let tick = 0; tick < 50; tick++) await Promise.resolve()
    })
  }

  vi.useFakeTimers()
  const { unmount } = render(
    <SettingsPanel
      settings={responses['/api/settings'] as never}
      onSaved={() => {}}
      onClose={() => {}}
    />,
  )
  await flush()

  const senders = screen.getByLabelText('Never mention these mail senders (one per line)')
  fireEvent.change(senders, { target: { value: 'spam@example.com' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  await flush()

  expect(screen.getByText(/The local server hit an error/)).toBeTruthy()
  expect(screen.getByText('1 change not saved')).toBeTruthy()
  expect((senders as HTMLTextAreaElement).value).toBe('spam@example.com')

  down = false
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await flush()
  expect(bodies).toEqual([
    { excludedSenders: ['spam@example.com'] },
    { excludedSenders: ['spam@example.com'] },
  ])
  expect(screen.getByText(/^Saved \d{2}:\d{2}$/)).toBeTruthy()
  expect(screen.queryByText('1 change not saved')).toBeNull()
  unmount()
})

test('an empty briefing says so instead of leaving a blank column', async () => {
  localStorage.setItem('dashboard.welcomed', '1')
  const briefings = {
    items: [{ id: 7, created_at: '2026-11-03T08:00:00.000Z', trigger: 'auto', markdown: '   ' }],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url === '/api/briefings?limit=10' ? briefings : responses[url] ?? {},
    })),
  )
  const { unmount } = render(<App />)
  expect(
    await screen.findByText('This briefing came back empty. Generate another one.'),
  ).toBeTruthy()
  unmount()
})
