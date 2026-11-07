import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.js'
import type { SecretBox } from './secrets.js'
import { listConnections, saveConnection, type Connection } from './connections.js'
import { sourceMeta, type Source, type SourceKind, type SourceService } from './sources/types.js'
import { isLocalOnly } from './settings.js'
import { createVaultSource } from './sources/vault/index.js'
import { createBrowserSource } from './sources/browser.js'
import { createChromiumBrowserReader } from './sources/browser-chromium.js'
import { createGithubApi, createGithubSource } from './sources/github.js'
import { createMailSource } from './sources/mail.js'
import { createImapMailApi } from './sources/mail-imap.js'
import {
  authorizedClient,
  hasScope,
  CALENDAR_SCOPE,
  DRIVE_SCOPE,
  TASKS_SCOPE,
  type GoogleCreds,
} from './google.js'
import { createDriveSource, createGoogleDriveApi } from './sources/drive.js'
import { createOpenMeteoApi, createWeatherSource } from './sources/weather.js'
import { createRssApi, createRssSource } from './sources/rss.js'
import { createGoogleTasksApi, createGoogleTasksSource } from './sources/google-tasks.js'
import { createSlackApi, createSlackSource } from './sources/slack.js'
import {
  createCalendarSource,
  createGoogleCalendarApi,
  parseCalendarIds,
} from './sources/calendar.js'
import { createCalDavCalendarApi } from './sources/caldav.js'
import { createMicrosoftCalendarApi } from './sources/microsoft-calendar.js'
import { createMicrosoftTeamsApi, createTeamsSource } from './sources/teams.js'
import { hasMicrosoftScope, type MicrosoftCreds, type MicrosoftTokens } from './microsoft.js'

export type RegistryDeps = {
  db: DatabaseSync
  box: SecretBox
  config: Config
  dataDir: string
}

export function googleCreds(connection: Connection, deps: RegistryDeps): GoogleCreds {
  return {
    clientId: connection.config.clientId ?? '',
    clientSecret: connection.secret?.clientSecret ?? '',
    port: deps.config.port,
    tokens: connection.secret?.tokens ?? null,
    onTokens: (tokens) => {
      saveConnection(deps.db, deps.box, {
        id: connection.id,
        service: connection.service,
        label: connection.label,
        config: connection.config,
        secret: { ...connection.secret, tokens },
      })
    },
  }
}

function parseMicrosoftTokens(raw: string | undefined): MicrosoftTokens | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MicrosoftTokens
    return typeof parsed?.access_token === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function microsoftCreds(connection: Connection, deps: RegistryDeps): MicrosoftCreds {
  return {
    clientId: connection.config.clientId ?? '',
    clientSecret: connection.secret?.clientSecret,
    tenant: connection.config.tenant?.trim() || 'common',
    port: deps.config.port,
    tokens: parseMicrosoftTokens(connection.secret?.tokens),
    onTokens: (tokens) => {
      saveConnection(deps.db, deps.box, {
        id: connection.id,
        service: connection.service,
        label: connection.label,
        config: connection.config,
        secret: { ...connection.secret, tokens: JSON.stringify(tokens) },
      })
    },
  }
}

/** Builds one source per enabled connection; Google yields a drive and a calendar source. */
export function buildSources(deps: RegistryDeps): Source[] {
  const sources: Source[] = []
  const localOnly = isLocalOnly(deps.db)

  for (const connection of listConnections(deps.db, deps.box)) {
    if (!connection.enabled) continue
    // Local only keeps the vault and the browser history; every outbound service is skipped.
    if (localOnly && connection.service !== 'vault' && connection.service !== 'browser') continue
    const meta = (kind: SourceKind) =>
      sourceMeta(kind, connection.service as SourceService, connection.id, connection.label)

    switch (connection.service) {
      case 'vault':
        sources.push(
          createVaultSource(connection.config.path || deps.config.vaultPath, meta('vault')),
        )
        break
      case 'browser':
        sources.push(
          createBrowserSource(
            createChromiumBrowserReader(
              deps.dataDir,
              connection.config.path || deps.config.browserHistoryPath,
            ),
            meta('browser'),
          ),
        )
        break
      case 'github':
        sources.push(createGithubSource(createGithubApi(connection.secret?.token ?? null), meta('github')))
        break
      case 'imap': {
        const source = createMailSource(
          createImapMailApi({
            user: connection.config.user ?? null,
            password: connection.secret?.password ?? null,
          }),
          meta('mail'),
        )
        // IDLE is opt-in per connection; polling remains the fallback when it is off.
        if (connection.config.idle !== 'true') delete source.watch
        sources.push(source)
        break
      }
      case 'weather':
        sources.push(
          createWeatherSource(createOpenMeteoApi(connection.config), meta('weather')),
        )
        break
      case 'rss':
        sources.push(
          createRssSource(
            createRssApi((connection.config.feeds ?? '').split(/[\n,]+/)),
            meta('rss'),
          ),
        )
        break
      case 'slack':
        sources.push(
          createSlackSource(
            createSlackApi(connection.secret?.token ?? null, connection.config.userId),
            meta('slack'),
          ),
        )
        break
      case 'caldav':
        sources.push(
          createCalendarSource(
            createCalDavCalendarApi({
              url: connection.config.url ?? '',
              username: connection.config.username ?? '',
              password: connection.secret?.password ?? '',
              calendarIds: (connection.config.calendarIds ?? '')
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean),
            }),
            meta('calendar'),
          ),
        )
        break
      case 'deepseek':
        break
      // Delivery services are not sources; they never yield a digest row.
      case 'smtp':
      case 'telegram':
        break
      case 'microsoft': {
        const creds = microsoftCreds(connection, deps)
        sources.push(
          createCalendarSource(
            createMicrosoftCalendarApi(
              hasMicrosoftScope(creds.tokens, 'Calendars.Read') ? creds : null,
            ),
            meta('calendar'),
          ),
        )
        sources.push(
          createTeamsSource(
            createMicrosoftTeamsApi(hasMicrosoftScope(creds.tokens, 'Chat.Read') ? creds : null),
            meta('teams'),
          ),
        )
        break
      }
      case 'google': {
        const creds = googleCreds(connection, deps)
        const driveClient = hasScope(creds.tokens, DRIVE_SCOPE) ? authorizedClient(creds) : null
        const calendarClient = hasScope(creds.tokens, CALENDAR_SCOPE)
          ? authorizedClient(creds)
          : null
        sources.push(createDriveSource(createGoogleDriveApi(driveClient), meta('drive')))
        sources.push(
          createCalendarSource(
            createGoogleCalendarApi(
              calendarClient,
              parseCalendarIds(connection.config.calendarIds),
            ),
            meta('calendar'),
          ),
        )
        const tasksClient = hasScope(creds.tokens, TASKS_SCOPE) ? authorizedClient(creds) : null
        sources.push(createGoogleTasksSource(createGoogleTasksApi(tasksClient), meta('tasks')))
        break
      }
    }
  }

  return sources
}

/** Sanitised view for the settings screen — secrets never leave the server. */
export function toPublicConnection(connection: Connection) {
  return {
    id: connection.id,
    service: connection.service,
    label: connection.label,
    config: connection.config,
    enabled: connection.enabled,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    secretsSet: Object.keys(connection.secret ?? {}),
  }
}

export function publicConnections(db: DatabaseSync, box: SecretBox) {
  return listConnections(db, box).map(toPublicConnection)
}
