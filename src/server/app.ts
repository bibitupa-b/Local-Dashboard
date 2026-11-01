import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.js'
import type { Source } from './sources/types.js'
import type { createBriefing } from './briefing/index.js'
import type { HealthMap, SyncState } from './health.js'
import type { ConnectionsApi } from './routes.js'
import { registerRoutes } from './routes.js'

export type Deps = {
  db: DatabaseSync
  config: Config
  sources?: Source[] | (() => Source[])
  getSources?: () => Source[]
  generate?: typeof createBriefing
  webRoot?: string
  isReady?: () => boolean
  health?: () => HealthMap
  syncState?: () => SyncState
  syncNow?: () => Promise<void>
  reload?: () => Promise<void>
  connections?: ConnectionsApi
  googleStart?: (connectionId: string, state: string) => string | null
  googleComplete?: (connectionId: string, code: string) => Promise<void>
}

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: false })

  const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])

  app.addHook('onRequest', async (request, reply) => {
    const host = (request.headers.host ?? '').split(':')[0]
    if (host && !localHosts.has(host.toLowerCase())) {
      return reply.code(403).send({ error: 'forbidden host' })
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.origin
      if (origin) {
        try {
          const parsed = new URL(origin)
          if (!localHosts.has(parsed.hostname.toLowerCase())) {
            return reply.code(403).send({ error: 'forbidden origin' })
          }
        } catch {
          return reply.code(403).send({ error: 'forbidden origin' })
        }
      }
    }
    return undefined
  })

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    )
    return payload
  })
  const sources = deps.getSources?.() ?? deps.sources ?? []

  registerRoutes(app, {
    db: deps.db,
    config: deps.config,
    sources: deps.getSources ?? sources,
    generate: deps.generate,
    isReady: deps.isReady,
    health: deps.health,
    syncState: deps.syncState,
    syncNow: deps.syncNow,
    reload: deps.reload,
    connections: deps.connections,
    googleStart: deps.googleStart,
    googleComplete: deps.googleComplete,
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
    app.register(fastifyStatic, {
      root: webRoot,
      cacheControl: false,
      setHeaders(res, filePath) {
        const cache = filePath.endsWith('index.html')
          ? 'no-store'
          : /[\\/]assets[\\/]/.test(filePath)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache'
        const carrier = res as unknown as {
          header?: (name: string, value: string) => void
          setHeader?: (name: string, value: string) => void
        }
        if (carrier.header) carrier.header('Cache-Control', cache)
        else carrier.setHeader?.('Cache-Control', cache)
      },
    })
  }

  return app
}
