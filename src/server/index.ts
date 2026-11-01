import { startServer, type RunningServer } from './server.js'

async function main(): Promise<void> {
  let server: RunningServer
  try {
    server = await startServer()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error('Port is already in use — another Local Dashboard is probably running.')
      process.exit(0)
    }
    throw error
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      await server.close()
      process.exit(0)
    })
  }
}

await main()
