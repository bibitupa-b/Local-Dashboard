import type { DatabaseSync } from 'node:sqlite'

export type Source = {
  id: string
  configured(): boolean
  sync(db: DatabaseSync, now?: Date): Promise<void>
  lastSync(db: DatabaseSync): string | null
  digest(db: DatabaseSync, since: Date): string[]
}
