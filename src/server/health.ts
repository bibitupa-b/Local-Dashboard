export type SourceHealth = {
  lastError: string | null
  lastErrorAt: string | null
  progress: { done: number; total: number } | null
}

export type HealthMap = Record<string, SourceHealth>

export type SyncState = {
  running: boolean
  source: string | null
  sourceIndex: number
  sourceTotal: number
  done: number
  total: number
}

export function createSyncState(): SyncState {
  return { running: false, source: null, sourceIndex: 0, sourceTotal: 0, done: 0, total: 0 }
}

export function startSync(state: SyncState, source: string, index: number, total: number): void {
  state.running = true
  state.source = source
  state.sourceIndex = index
  state.sourceTotal = total
  state.done = 0
  state.total = 1
}

export function updateSyncProgress(state: SyncState, done: number, total: number): void {
  state.done = done
  state.total = Math.max(total, 1)
}

export function finishSync(state: SyncState): void {
  state.running = false
  state.source = null
  state.done = 0
  state.total = 0
}

export function createHealth(sourceIds: string[]): HealthMap {
  return Object.fromEntries(
    sourceIds.map((id) => [id, { lastError: null, lastErrorAt: null, progress: null }]),
  )
}

export function markSuccess(health: HealthMap, id: string): void {
  const entry = health[id] ?? (health[id] = { lastError: null, lastErrorAt: null, progress: null })
  entry.lastError = null
  entry.progress = null
}

export function markFailure(health: HealthMap, id: string, error: unknown, now = new Date()): void {
  const entry = health[id] ?? (health[id] = { lastError: null, lastErrorAt: null, progress: null })
  entry.lastError = error instanceof Error ? error.message : String(error)
  entry.lastErrorAt = now.toISOString()
  entry.progress = null
}

export function markProgress(
  health: HealthMap,
  id: string,
  done: number,
  total: number,
): void {
  const entry = health[id] ?? (health[id] = { lastError: null, lastErrorAt: null, progress: null })
  entry.progress = { done, total }
}
