import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_LOG_BYTES = 5 * 1024 * 1024

export function rotateIfNeeded(path: string, maxBytes = MAX_LOG_BYTES): void {
  if (!existsSync(path)) return
  if (statSync(path).size < maxBytes) return
  renameSync(path, `${path}.1`)
}

function format(value: unknown): string {
  if (value instanceof Error) return value.stack ?? value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Mirrors console output into data/server.log so the hidden autostart leaves a trail. */
export function initLogging(dataDir: string): string {
  mkdirSync(dataDir, { recursive: true })
  const path = join(dataDir, 'server.log')

  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      try {
        rotateIfNeeded(path)
        appendFileSync(path, `${new Date().toISOString()} [${level}] ${args.map(format).join(' ')}\n`)
      } catch {
        // logging must never take the app down
      }
    }
  }
  return path
}
