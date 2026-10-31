import { DatabaseSync } from 'node:sqlite'

export function openDb(path: string): DatabaseSync {
  return new DatabaseSync(path)
}
