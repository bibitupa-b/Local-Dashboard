import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.js'
import type { Source } from './sources/types.js'
import type { createBriefing } from './briefing/index.js'
import type { HealthMap, SyncState } from './health.js'
import { registerRoutes } from './routes.js'

export type Deps = {
  db: DatabaseSync
  config: Config
  sources?: Source[]
  generate?: typeof createBriefing
  webRoot?: string
  onDriveConnected?: () => void
  isReady?: () => boolean
  health?: () => HealthMap
  syncState?: () => SyncState
  syncNow?: () => Promise<void>
}

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: false })
  const sources = deps.sources ?? []

  registerRoutes(app, {
    db: deps.db,
    config: deps.config,
    sources,
    generate: deps.generate,
    onDriveConnected: deps.onDriveConnected,
    isReady: deps.isReady,
    health: deps.health,
    syncState: deps.syncState,
    syncNow: deps.syncNow,
  })

  const webRoot = deps.webRoot ?? join(process.cwd(), 'dist', 'web')
  const hasUi = existsSync(join(webRoot, 'index.html'))

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not found' })
    }
    if (hasUi) return reply.sendFile('index.html')
    return reply.code(404).send({ error: 'not found' })
  })

  if (hasUi) {
    app.register(fastifyStatic, { root: webRoot })
  }

  return app
}
