import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.js'
import type { SecretBox } from './secrets.js'
import { listConnections, saveConnection, type Connection } from './connections.js'
import { sourceMeta, type Source, type SourceKind } from './sources/types.js'
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
  type GoogleCreds,
} from './google.js'
import { createDriveSource, createGoogleDriveApi } from './sources/drive.js'
import { createCalendarSource, createGoogleCalendarApi } from './sources/calendar.js'

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

/** Builds one source per enabled connection; Google yields a drive and a calendar source. */
export function buildSources(deps: RegistryDeps): Source[] {
  const sources: Source[] = []

  for (const connection of listConnections(deps.db, deps.box)) {
    if (!connection.enabled) continue
    const meta = (kind: SourceKind) =>
      sourceMeta(kind, connection.service, connection.id, connection.label)

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
      case 'imap':
        sources.push(
          createMailSource(
            createImapMailApi({
              user: connection.config.user ?? null,
              password: connection.secret?.password ?? null,
            }),
            meta('mail'),
          ),
        )
        break
      case 'google': {
        const creds = googleCreds(connection, deps)
        const driveClient = hasScope(creds.tokens, DRIVE_SCOPE) ? authorizedClient(creds) : null
        const calendarClient = hasScope(creds.tokens, CALENDAR_SCOPE)
          ? authorizedClient(creds)
          : null
        sources.push(createDriveSource(createGoogleDriveApi(driveClient), meta('drive')))
        sources.push(createCalendarSource(createGoogleCalendarApi(calendarClient), meta('calendar')))
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
