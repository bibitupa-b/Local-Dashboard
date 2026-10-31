export type SourceHealth = {
  lastError: string | null
  lastErrorAt: string | null
  progress: { done: number; total: number } | null
}

export type HealthMap = Record<string, SourceHealth>

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
