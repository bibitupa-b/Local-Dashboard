import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export type Config = {
  port: number
  vaultPath: string
  dataDir: string
  dbPath: string
  deepseekKey: string | null
  googleClientId: string | null
  googleClientSecret: string | null
  briefingHour: number
}

function value(env: NodeJS.ProcessEnv, key: string): string | null {
  const raw = env[key]?.trim()
  return raw ? raw : null
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolve(value(env, 'DATA_DIR') ?? join(process.cwd(), 'data'))
  return {
    port: Number(env.PORT) || 4317,
    vaultPath: resolve(value(env, 'VAULT_PATH') ?? join(homedir(), 'Documents', 'Main Obsidian Vault')),
    dataDir,
    dbPath: join(dataDir, 'dashboard.db'),
    deepseekKey: value(env, 'DEEPSEEK_API_KEY'),
    googleClientId: value(env, 'GOOGLE_CLIENT_ID'),
    googleClientSecret: value(env, 'GOOGLE_CLIENT_SECRET'),
    briefingHour: Number(env.BRIEFING_HOUR) || 8,
  }
}
