export type SourceStatus = {
  id: string
  configured: boolean
  lastSync: string | null
  lastError?: string | null
  lastErrorAt?: string | null
  progress?: { done: number; total: number } | null
}
export type Status = { sources: SourceStatus[]; briefingToday: boolean }
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
  kind: 'task' | 'mail' | 'calendar' | 'stale-project' | 'inbox' | 'drive'
  label: string
  detail: string
  count?: number
  path?: string
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
  mail: Array<{ sender: string; subject: string; date: string }>
  drive: Array<{ name: string; modifiedTime: string }>
}
export type Settings = {
  vaultPath: string
  briefingHour: number
  hasDeepSeekKey: boolean
  googleConfigured: boolean
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
    await fetch('/api/sync', { method: 'POST' })
  },
  generate: async (): Promise<{ markdown: string } | { error: string }> => {
    const res = await fetch('/api/briefings/generate', { method: 'POST' })
    return res.json()
  },
  saveSettings: async (body: {
    vaultPath?: string
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
    })
  },
}
