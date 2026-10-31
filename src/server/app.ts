import Fastify, { type FastifyInstance } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.js'

export type Deps = {
  db: DatabaseSync
  config: Config
}

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: false })
  app.get('/api/health', async () => ({ ok: true }))
  return app
}
