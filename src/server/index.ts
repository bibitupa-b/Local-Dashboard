import { join } from 'node:path'
import { schedule } from 'node-cron'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { getSetting, openDb } from './db/index.js'
import { createBriefing } from './briefing/index.js'
import { shouldCatchUp } from './briefing/schedule.js'
import { createDriveSource, createGoogleDriveApi } from './sources/drive.js'
import type { Source } from './sources/types.js'
import { createVaultSource, startVaultWatcher } from './sources/vault/index.js'

const config = loadConfig()
const db = openDb(config.dbPath)

config.vaultPath = getSetting(db, 'vault_path') ?? config.vaultPath
config.briefingHour = Number(getSetting(db, 'briefing_hour')) || config.briefingHour

const sources: Source[] = [
  createVaultSource(config.vaultPath),
  createDriveSource(await createGoogleDriveApi(config)),
]

const webRoot = join(process.cwd(), 'dist', 'web')
const app = buildApp({ db, config, sources, webRoot })

for (const source of sources) {
  try {
    await source.sync(db)
  } catch (error) {
    console.error(`[${source.id}] sync failed:`, error)
  }
}

const stopWatcher = startVaultWatcher(config.vaultPath, db)

async function brief(trigger: 'auto' | 'manual'): Promise<void> {
  const result = await createBriefing(db, sources, config, { trigger })
  if ('error' in result) console.error('[briefing]', result.error)
  else console.log('[briefing] generated')
}

const lastBriefing = db.prepare('SELECT created_at FROM briefings ORDER BY id DESC LIMIT 1').get() as
  | { created_at: string }
  | undefined
if (shouldCatchUp(lastBriefing ? new Date(lastBriefing.created_at) : null, new Date(), config.briefingHour)) {
  void brief('auto')
}

schedule(`0 ${config.briefingHour} * * *`, () => void brief('auto'))
schedule('*/15 * * * *', () => {
  for (const source of sources) void source.sync(db).catch((error) => console.error(`[${source.id}]`, error))
})

await app.listen({ host: '127.0.0.1', port: config.port })
console.log(`Local Dashboard on http://localhost:${config.port}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await stopWatcher()
    await app.close()
    process.exit(0)
  })
}
