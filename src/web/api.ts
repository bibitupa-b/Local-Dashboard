export type SourceStatus = {
  id: string
  kind: 'vault' | 'drive' | 'mail' | 'calendar' | 'browser' | 'github'
  service: 'vault' | 'google' | 'imap' | 'github' | 'browser'
  connectionId: string
  label: string
  configured: boolean
  lastSync: string | null
  lastError?: string | null
  lastErrorAt?: string | null
  progress?: { done: number; total: number } | null
}
export type SyncState = {
  running: boolean
  source: string | null
  sourceIndex: number
  sourceTotal: number
  done: number
  total: number
}
export type Status = { sources: SourceStatus[]; briefingToday: boolean; sync: SyncState }
export type FeedItem = {
  source: 'vault' | 'drive'
  id?: number
  label: string
  detail: string
  at: string
  added?: number
  removed?: number
}
export type FeedDay = { date: string; items: FeedItem[] }
export type AttentionItem = {
  kind:
    | 'task'
    | 'mail'
    | 'reply'
    | 'browser'
    | 'github'
    | 'calendar'
    | 'stale-project'
    | 'inbox'
    | 'drive'
  label: string
  detail: string
  count?: number
  path?: string
  messageId?: string
  url?: string
  fileId?: string
}
export type Briefing = { id: number; created_at: string; trigger: string; markdown: string }
export type CalendarEvent = {
  id: string
  calendarId: string
  summary: string
  start: string
  end: string
  location: string | null
  status: string
}
export type Today = {
  events: CalendarEvent[]
  free: Array<{ from: string; to: string }>
  conflicts: string[]
}
export type SearchResults = {
  notes: Array<{ path: string; snippet: string }>
  mail: Array<{ sender: string; subject: string; date: string; messageId: string | null }>
  drive: Array<{ id: string; name: string; modifiedTime: string; snippet?: string | null }>
}
export type Settings = {
  vaultPath: string
  briefingHour: number
  hasDeepSeekKey: boolean
  driveConnected: boolean
  mailConfigured: boolean
  mailConnected: boolean
  calendarConnected: boolean
  excludedSenders: string[]
  excludedMailFolders: string[]
  excludedVaultPrefixes: string[]
  excludedBrowserDomains: string[]
  browserConfigured: boolean
  githubConfigured: boolean
  githubConnected: boolean
  digestWindowHours: number
  enabledSources: string[]
  dataDir: string
}

export type Service = 'vault' | 'google' | 'imap' | 'github' | 'browser' | 'deepseek'

export type Connection = {
  id: string
  service: Service
  label: string
  config: Record<string, string>
  enabled: boolean
  lastError: string | null
  createdAt: string
  secretsSet: string[]
}

export type ConnectionInput = {
  service: Service
  label: string
  config: Record<string, string>
  secret?: Record<string, string>
  enabled?: boolean
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  status: () => get<Status>('/api/status'),
  feed: () => get<{ days: FeedDay[] }>('/api/feed?days=7'),
  attention: () => get<AttentionItem[]>('/api/attention'),
  briefings: () => get<{ items: Briefing[] }>('/api/briefings?limit=10'),
  settings: () => get<Settings>('/api/settings'),
  today: () => get<Today>('/api/today'),
  search: (query: string) => get<SearchResults>(`/api/search?q=${encodeURIComponent(query)}`),
  vaultChange: (id: number) =>
    get<{ path: string; diff: string; detected_at: string }>(`/api/vault/changes/${id}`),
  sync: async (): Promise<void> => {
    const res = await fetch('/api/sync', { method: 'POST' })
    if (!res.ok) throw new Error(`Sync failed (${res.status})`)
  },
  generate: async (): Promise<{ markdown: string } | { error: string }> => {
    const res = await fetch('/api/briefings/generate', { method: 'POST' })
    return res.json()
  },
  saveSettings: async (body: {
    briefingHour?: number
    excludedSenders?: string[]
    excludedVaultPrefixes?: string[]
    excludedBrowserDomains?: string[]
    digestWindowHours?: number
    enabledSources?: string[]
  }): Promise<void> => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) throw new Error(`Saving preferences failed (${res.status})`)
    })
  },
  connections: () => get<{ items: Connection[] }>('/api/connections'),
  addConnection: async (input: ConnectionInput): Promise<Connection> => {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
    return res.json()
  },
  updateConnection: async (id: string, input: ConnectionInput): Promise<Connection> => {
    const res = await fetch(`/api/connections/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
    return res.json()
  },
  deleteConnection: async (id: string): Promise<void> => {
    await fetch(`/api/connections/${id}`, { method: 'DELETE' })
  },
  testConnection: (id: string) =>
    fetch(`/api/connections/${id}/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).then((res) => res.json() as Promise<{ ok: boolean; error?: string }>),
}

