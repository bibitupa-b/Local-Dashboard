import type { DatabaseSync } from 'node:sqlite'

export type Source = {
  id: string
  configured(): boolean
  sync(db: DatabaseSync, now?: Date, progress?: (done: number, total: number) => void): Promise<void>
  lastSync(db: DatabaseSync): string | null
  digest(db: DatabaseSync, since: Date): string[]
}
