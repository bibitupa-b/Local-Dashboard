import type { DatabaseSync } from 'node:sqlite'

export type SourceKind = 'vault' | 'drive' | 'mail' | 'calendar' | 'browser' | 'github'
export type SourceService = 'vault' | 'google' | 'imap' | 'github' | 'browser'

export type SourceMeta = {
  id: string
  kind: SourceKind
  service: SourceService
  connectionId: string
  label: string
}

export function sourceMeta(
  kind: SourceKind,
  service: SourceService,
  connectionId = 'default',
  label: string = kind,
): SourceMeta {
  return { id: `${kind}:${connectionId}`, kind, service, connectionId, label }
}

export type Source = SourceMeta & {
  configured(): boolean
  sync(db: DatabaseSync, now?: Date, progress?: (done: number, total: number) => void): Promise<void>
  lastSync(db: DatabaseSync): string | null
  digest(db: DatabaseSync, since: Date): string[]
}
