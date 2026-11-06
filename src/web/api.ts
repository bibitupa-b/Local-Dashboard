import type { BriefingStats, WidgetLayout } from '../shared/widgets.js'

export type { BriefingStats, WidgetLayout }

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
export type Status = {
  version: string
  sources: SourceStatus[]
  briefingToday: boolean
  briefingKindsToday?: string[]
  briefingError: { at: string; message: string } | null
  sync: SyncState
}
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
    | 'google-task'
  label: string
  detail: string
  count?: number
  path?: string
  messageId?: string
  url?: string
  fileId?: string
}
export type BriefingRef =
  | { kind: 'note'; label: string; path: string }
  | { kind: 'mail'; label: string; messageId: string | null }
  | { kind: 'drive'; label: string; fileId: string }
  | { kind: 'event'; label: string }
  | { kind: 'browser'; label: string }
  | { kind: 'github'; label: string; url: string | null }
export type BriefingBody = {
  headline: string
  bullets: Array<{ text: string; refs: BriefingRef[] }>
  suggestion: string
}
export type Briefing = {
  id: number
  created_at: string
  trigger: string
  kind?: string
  markdown: string
  digest?: string
  body: BriefingBody | null
  feedback: 'useful' | 'miss' | null
  opens: number
  digest_meta?: {
    since?: string
    until?: string
    headline?: string
    usage?: { prompt: number; completion: number }
    model?: string
    grounding?: { dropped: number; verified: boolean; error?: string }
  }
}
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
  workHours?: { start: number; end: number }
}
export type SearchResults = {
  notes: Array<{ path: string; snippet: string }>
  mail: Array<{ sender: string; subject: string; date: string; messageId: string | null }>
  drive: Array<{ id: string; name: string; modifiedTime: string; snippet?: string | null }>
}
export type MotionPreset = 'calm' | 'balanced' | 'lively'

/** Appearance knobs; the server clamps every number before it is stored. */
export type Appearance = {
  blur: number
  glass: number
  grain: number
  shadow: number
  photo: number
  motion: MotionPreset
  accent: number | null
}

export type Settings = {
  vaultPath: string
  briefingHour: number
  workStart: number
  workEnd: number
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
  briefingLanguage: 'auto' | 'ru' | 'en'
  briefingProfile: string
  eveningPass: boolean
  meetingPrep: boolean
  mailBodyDays: number
  browserDays: number
  vaultChangeDays: number
  enabledSources: string[]
  wallpaper: string
  appearance: Appearance
  widgets: WidgetLayout[]
  groundingStrict: boolean
  dataDir: string
}

export type Service =
  | 'vault'
  | 'google'
  | 'imap'
  | 'github'
  | 'browser'
  | 'weather'
  | 'rss'
  | 'deepseek'

export type Connection = {
  id: string
  service: Service
  label: string
  config: Record<string, string>
  enabled: boolean
  lastError: string | null
  createdAt: string
  secretsSet: string[]
  configured?: boolean
  lastSync?: string | null
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
  activity: () => get<AttentionItem[]>('/api/activity'),
  briefings: () => get<{ items: Briefing[] }>('/api/briefings?limit=10'),
  briefingStats: (days = 7) => get<BriefingStats>(`/api/briefings/stats?days=${days}`),
  settings: () => get<Settings>('/api/settings'),
  today: () => get<Today>('/api/today'),
  search: (query: string) => get<SearchResults>(`/api/search?q=${encodeURIComponent(query)}`),
  vaultChange: (id: number) =>
    get<{ path: string; diff: string; detected_at: string }>(`/api/vault/changes/${id}`),
  sync: async (): Promise<void> => {
    const res = await fetch('/api/sync', { method: 'POST' })
    if (!res.ok) throw new Error(`Sync failed (${res.status})`)
  },
  generate: async (): Promise<
    | {
        id: number
        markdown: string
        body: BriefingBody
        digest: string
        digestMeta: Record<string, unknown>
      }
    | { error: string }
  > => {
    const res = await fetch('/api/briefings/generate', { method: 'POST' })
    return res.json()
  },
  feedback: async (id: number, value: 'useful' | 'miss' | null): Promise<void> => {
    const res = await fetch(`/api/briefings/${id}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    if (!res.ok) throw new Error(`Feedback failed (${res.status})`)
  },
  bulletFeedback: async (
    id: number,
    index: number,
    value: 'useful' | 'miss' | null,
  ): Promise<void> => {
    const res = await fetch(`/api/briefings/${id}/bullets/${index}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    })
    if (!res.ok) throw new Error(`Point feedback failed (${res.status})`)
  },
  opened: async (id: number): Promise<void> => {
    await fetch(`/api/briefings/${id}/opened`, { method: 'POST', keepalive: true })
  },
  ask: async (id: number, question: string): Promise<string> => {
    const res = await fetch(`/api/briefings/${id}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    })
    const data = (await res.json()) as { answer?: string; error?: string }
    if (!res.ok || typeof data.answer !== 'string') {
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    return data.answer
  },
  saveSettings: async (body: {
    briefingHour?: number
    workStart?: number
    workEnd?: number
    excludedSenders?: string[]
    excludedMailFolders?: string[]
    excludedVaultPrefixes?: string[]
    excludedBrowserDomains?: string[]
    digestWindowHours?: number
    briefingLanguage?: 'auto' | 'ru' | 'en'
    briefingProfile?: string
    eveningPass?: boolean
    meetingPrep?: boolean
    mailBodyDays?: number
    browserDays?: number
    vaultChangeDays?: number
    enabledSources?: string[]
    wallpaper?: string
    appearance?: Partial<Appearance>
    widgets?: WidgetLayout[]
    groundingStrict?: boolean
  }): Promise<void> => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) throw new Error(`Saving preferences failed: ${res.status}`)
    })
  },
  exportData: async (): Promise<Blob> => {
    const res = await fetch('/api/export')
    if (!res.ok) throw new Error(`Export failed (${res.status})`)
    return res.blob()
  },
  deleteData: async (): Promise<void> => {
    const res = await fetch('/api/data', { method: 'DELETE' })
    if (!res.ok) throw new Error(`Delete failed (${res.status})`)
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

