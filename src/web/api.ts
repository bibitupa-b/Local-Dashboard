export type SourceStatus = { id: string; configured: boolean; lastSync: string | null }
export type Status = { sources: SourceStatus[]; briefingToday: boolean }
export type FeedItem = {
  source: 'vault' | 'drive'
  label: string
  detail: string
  at: string
  added?: number
  removed?: number
}
export type FeedDay = { date: string; items: FeedItem[] }
export type AttentionItem = {
  kind: 'task' | 'stale-project' | 'inbox' | 'drive'
  label: string
  detail: string
  count?: number
  path?: string
}
export type Briefing = { id: number; created_at: string; trigger: string; markdown: string }
export type Settings = {
  vaultPath: string
  briefingHour: number
  hasDeepSeekKey: boolean
  googleConfigured: boolean
  driveConnected: boolean
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
  generate: async (): Promise<{ markdown: string } | { error: string }> => {
    const res = await fetch('/api/briefings/generate', { method: 'POST' })
    return res.json()
  },
  saveSettings: async (body: { vaultPath?: string; briefingHour?: number }): Promise<void> => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  },
}
