import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from './db/index.js'
import type { Config } from './config.js'
import type { SecretBox } from './secrets.js'

export type Service = 'vault' | 'google' | 'imap' | 'github' | 'browser'
export const SERVICES: Service[] = ['vault', 'google', 'imap', 'github', 'browser']

export type Connection = {
  id: string
  service: Service
  label: string
  config: Record<string, string>
  secret: Record<string, string> | null
  enabled: boolean
  lastError: string | null
  createdAt: string
}

export type ConnectionInput = {
  id?: string
  service: Service
  label: string
  config: Record<string, string>
  secret?: Record<string, string> | null
  enabled?: boolean
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toConnection(row: Record<string, unknown>, box: SecretBox): Connection {
  let secret: Record<string, string> | null = null
  if (typeof row.secret === 'string' && row.secret) {
    try {
      secret = JSON.parse(box.decrypt(row.secret)) as Record<string, string>
    } catch {
      secret = null
    }
  }
  return {
    id: row.id as string,
    service: row.service as Service,
    label: row.label as string,
    config: parseJson(row.config as string, {}),
    secret,
    enabled: row.enabled === 1,
    lastError: (row.last_error as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

export function listConnections(db: DatabaseSync, box: SecretBox): Connection[] {
  return (
    db.prepare('SELECT * FROM connections ORDER BY service, created_at').all() as Record<string, unknown>[]
  ).map((row) => toConnection(row, box))
}

export function getConnection(db: DatabaseSync, box: SecretBox, id: string): Connection | null {
  const row = db.prepare('SELECT * FROM connections WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? toConnection(row, box) : null
}

export function saveConnection(
  db: DatabaseSync,
  box: SecretBox,
  input: ConnectionInput,
  now = new Date(),
): Connection {
  if (!SERVICES.includes(input.service)) throw new Error(`Unknown service: ${input.service}`)
  const config = Object.fromEntries(
    Object.entries(input.config).map(([key, value]) => [key, String(value ?? '').trim()]),
  )
  const secret = input.secret && Object.keys(input.secret).length > 0 ? input.secret : null

  if (input.id) {
    const existing = getConnection(db, box, input.id)
    if (!existing) throw new Error(`Unknown connection: ${input.id}`)
    const mergedSecret = secret ?? existing.secret
    db.prepare(
      `UPDATE connections SET service = ?, label = ?, config = ?, secret = ?, enabled = ? WHERE id = ?`,
    ).run(
      input.service,
      input.label.trim() || existing.label,
      JSON.stringify(config),
      mergedSecret ? box.encrypt(JSON.stringify(mergedSecret)) : null,
      input.enabled === false ? 0 : 1,
      input.id,
    )
    return getConnection(db, box, input.id)!
  }

  const id = `${input.service}-${randomBytes(4).toString('hex')}`
  db.prepare(
    `INSERT INTO connections (id, service, label, config, secret, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.service,
    input.label.trim() || input.service,
    JSON.stringify(config),
    secret ? box.encrypt(JSON.stringify(secret)) : null,
    input.enabled === false ? 0 : 1,
    now.toISOString(),
  )
  return getConnection(db, box, id)!
}

export function deleteConnection(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM connections WHERE id = ?').run(id)
}

export function markConnectionSync(
  db: DatabaseSync,
  id: string,
  error: string | null,
): void {
  db.prepare('UPDATE connections SET last_error = ? WHERE id = ?').run(error, id)
}

/** One-time import of the existing .env configuration into connection rows. */
export function importConnectionsFromEnv(
  db: DatabaseSync,
  box: SecretBox,
  config: Config,
  dataDir: string,
): void {
  if (getSetting(db, 'connections_initialized')) return

  const create = (service: Service, label: string, cfg: Record<string, string>, secret?: Record<string, string>) => {
    const count = (
      db.prepare('SELECT COUNT(*) AS n FROM connections WHERE service = ?').get(service) as { n: number }
    ).n
    if (count > 0) return
    saveConnection(db, box, { service, label, config: cfg, secret: secret ?? null })
  }

  create('vault', 'Main vault', { path: config.vaultPath })
  create('browser', 'Browser history', { path: config.browserHistoryPath ?? '' })

  if (config.googleClientId && config.googleClientSecret) {
    const secret: Record<string, string> = { clientSecret: config.googleClientSecret }
    const tokenPath = join(dataDir, 'google-token.json')
    if (existsSync(tokenPath)) {
      try {
        secret.tokens = readFileSync(tokenPath, 'utf8')
      } catch {
        // keep the client secret even if the token file is unreadable
      }
    }
    create('google', 'Google', { clientId: config.googleClientId }, secret)
  }

  if (config.gmailUser && config.gmailPassword) {
    create('imap', config.gmailUser, { user: config.gmailUser }, { password: config.gmailPassword })
  }

  if (config.githubToken) {
    create('github', 'GitHub', {}, { token: config.githubToken })
  }

  setSetting(db, 'connections_initialized', new Date().toISOString())
}
