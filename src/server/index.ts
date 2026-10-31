import { loadConfig } from './config.js'
import { openDb } from './db/index.js'
import { buildApp } from './app.js'

const config = loadConfig()
const db = openDb(config.dbPath)
const app = buildApp({ db, config })

await app.listen({ host: '127.0.0.1', port: config.port })
console.log(`Local Dashboard on http://localhost:${config.port}`)
