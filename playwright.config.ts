import { defineConfig } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// One fresh data dir per `playwright test` run, so tests never read or mutate real data.
// A thrown-away vault keeps the vault source's startup scan instant and deterministic.
const dataDir = mkdtempSync(join(tmpdir(), 'local-dashboard-e2e-'))
mkdirSync(join(dataDir, 'vault'), { recursive: true })

export default defineConfig({
  testDir: './e2e',
  // The web server is a single stateful SQLite process; tests must not run in parallel.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4318',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://127.0.0.1:4318/api/health',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: '4318',
      DATA_DIR: dataDir,
      VAULT_PATH: join(dataDir, 'vault'),
      BROWSER_HISTORY_PATH: join(dataDir, 'no-history'),
      // The repo's .env must not leak real keys into the test server. `loadEnvFile` never
      // overrides an already-set variable, so empty strings keep the connections list clean.
      DEEPSEEK_API_KEY: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GMAIL_USER: '',
      GMAIL_APP_PASSWORD: '',
      GITHUB_TOKEN: '',
    },
  },
})
