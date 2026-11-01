import { useEffect, useId, useRef, useState } from 'react'
import {
  api,
  type Connection,
  type ConnectionInput,
  type Service,
  type Settings,
} from './api.js'

type FieldDef = {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
  optional?: boolean
}

type ServiceDef = {
  service: Service
  name: string
  description: string
  hint: string
  fields: FieldDef[]
}

const SERVICES: ServiceDef[] = [
  {
    service: 'vault',
    name: 'Obsidian vault',
    description: 'Notes are read locally, never uploaded.',
    hint: `1. Open Obsidian and right-click the vault name.
2. Choose "Show in system explorer".
3. Copy the folder path and paste it here.
Only .md files are read; the app never writes to the vault.`,
    fields: [
      {
        key: 'path',
        label: 'Vault folder',
        placeholder: 'C:\\Users\\you\\Documents\\Main Obsidian Vault',
      },
    ],
  },
  {
    service: 'google',
    name: 'Google Drive & Calendar',
    description: 'Read-only access to Drive files and the primary calendar.',
    hint: `1. console.cloud.google.com -> create a project.
2. Enable "Google Drive API" and "Google Calendar API" in Library.
3. OAuth consent screen: External; publish to Production (Testing expires tokens in 7 days).
4. Credentials -> Create credentials -> OAuth client ID -> Desktop app.
5. Paste Client ID and Client secret, save, then press Connect.`,
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: '...apps.googleusercontent.com' },
      { key: 'clientSecret', label: 'Client secret', secret: true, placeholder: 'GOCSPX-...' },
    ],
  },
  {
    service: 'imap',
    name: 'Gmail (IMAP)',
    description: 'Reads mail over IMAP with an app password.',
    hint: `1. Google Account -> Security -> 2-Step Verification.
2. At the bottom open "App passwords" (or myaccount.google.com/apppasswords).
3. Create one named "Local Dashboard" and copy the 16 characters.
4. Enter your Gmail address and that password here.`,
    fields: [
      { key: 'user', label: 'Gmail address', placeholder: 'you@gmail.com' },
      { key: 'password', label: 'App password', secret: true, placeholder: 'xxxxxxxxxxxxxxxx' },
    ],
  },
  {
    service: 'github',
    name: 'GitHub',
    description: 'Unread notifications and review requests.',
    hint: `1. github.com/settings/tokens -> Generate new token (classic).
2. Select the "notifications" scope (add "repo" for private repositories).
3. Copy the token once and paste it here.`,
    fields: [{ key: 'token', label: 'Personal access token', secret: true, placeholder: 'ghp_...' }],
  },
  {
    service: 'browser',
    name: 'Browser history',
    description: 'Helium, Chrome or Edge history; only domains reach the briefing.',
    hint: `Leave the path empty to auto-detect Helium, Chrome or Edge.
For another Chromium profile, point to its History file:
%LOCALAPPDATA%\\<browser>\\User Data\\<profile>\\History
Excluded domains are listed under Preferences.`,
    fields: [
      {
        key: 'path',
        label: 'History file (optional)',
        optional: true,
        placeholder: 'auto-detect',
      },
    ],
  },
  {
    service: 'deepseek',
    name: 'DeepSeek API',
    description: 'Powers the daily briefing.',
    hint: `1. platform.deepseek.com -> sign in.
2. Open "API keys" -> Create new API key.
3. Copy the sk-... value (shown once) and paste it here.
4. Top up the balance under Billing, otherwise requests return 402.`,
    fields: [{ key: 'key', label: 'API key', secret: true, placeholder: 'sk-...' }],
  },
]

const SOURCE_LABELS: Record<string, string> = {
  vault: 'vault',
  drive: 'drive',
  mail: 'mail',
  calendar: 'calendar',
  browser: 'browser',
  github: 'github',
}

type Notice = { text: string; tone: 'info' | 'success' | 'error' }

export function SettingsPanel({
  settings,
  onSaved,
  onClose,
}: {
  settings: Settings
  onSaved: (next: Settings) => void
  onClose: () => void
}) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [editing, setEditing] = useState<{ service: Service; connection?: Connection } | null>(null)
  const [confirming, setConfirming] = useState<Connection | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [tests, setTests] = useState<Record<string, string>>({})
  const [briefingHour, setBriefingHour] = useState(settings.briefingHour)
  const [windowHours, setWindowHours] = useState(settings.digestWindowHours)
  const [senders, setSenders] = useState(settings.excludedSenders.join('\n'))
  const [vaultPrefixes, setVaultPrefixes] = useState(settings.excludedVaultPrefixes.join('\n'))
  const [browserDomains, setBrowserDomains] = useState(settings.excludedBrowserDomains.join('\n'))
  const [enabled, setEnabled] = useState<string[]>(
    settings.enabledSources.length > 0 ? settings.enabledSources : Object.keys(SOURCE_LABELS),
  )

  async function loadConnections() {
    const { items } = await api.connections()
    setConnections(items)
  }

  useEffect(() => {
    void loadConnections()
  }, [])

  async function test(connection: Connection) {
    setTests((current) => ({ ...current, [connection.id]: 'testing…' }))
    const result = await api.testConnection(connection.id)
    setTests((current) => ({
      ...current,
      [connection.id]: result.ok ? 'works' : (result.error ?? 'failed'),
    }))
  }

  async function confirmDisconnect() {
    if (!confirming) return
    const target = confirming
    setConfirming(null)
    await api.deleteConnection(target.id)
    await loadConnections()
    setNotice({ text: `Removed ${target.label}.`, tone: 'success' })
  }

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault()
    const next = {
      ...settings,
      briefingHour,
      digestWindowHours: windowHours,
      excludedSenders: lines(senders),
      excludedVaultPrefixes: lines(vaultPrefixes),
      excludedBrowserDomains: lines(browserDomains),
      enabledSources: enabled,
    }
    await api.saveSettings({
      briefingHour,
      digestWindowHours: windowHours,
      excludedSenders: next.excludedSenders,
      excludedVaultPrefixes: next.excludedVaultPrefixes,
      excludedBrowserDomains: next.excludedBrowserDomains,
      enabledSources: enabled,
    })
    onSaved(next)
    setNotice({ text: 'Preferences saved.', tone: 'success' })
  }

  return (
    <div className="settings-page">
      <div className="settings-head">
        <h2>Settings</h2>
        <button className="ghost" type="button" onClick={onClose}>
          Back to dashboard
        </button>
      </div>

      {notice && (
        <p className={`note ${notice.tone}`} role="status" aria-live="polite">
          {notice.text}
        </p>
      )}

      <section className="card">
        <h2>Connections</h2>
        <p className="sub">
          DeepSeek key: {settings.hasDeepSeekKey ? 'configured' : 'not set — add it under DeepSeek API'}
        </p>
        {SERVICES.map((definition) => {
          const rows = connections.filter((row) => row.service === definition.service)
          return (
            <div key={definition.service} className="conn-group">
              <div className="conn-group-head">
                <h3>
                  {definition.name} <Hint text={definition.hint} />
                </h3>
                <button
                  type="button"
                  className="ghost mini"
                  onClick={() => setEditing({ service: definition.service })}
                >
                  {rows.length > 0 ? '+ Add account' : 'Connect'}
                </button>
              </div>
              {rows.length === 0 ? (
                <p className="empty">{definition.description}</p>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className="conn-row">
                    <span
                      className={`dot ${row.lastError ? 'bad' : isHealthy(row) ? 'ok' : ''}`}
                      title={row.lastError ?? (isHealthy(row) ? 'enabled' : 'needs attention')}
                    />
                    <span className="label">{row.label}</span>
                    <span className="detail">{detailOf(row)}</span>
                    <span className="conn-actions">
                      <button type="button" className="ghost mini" onClick={() => void test(row)}>
                        Test
                      </button>
                      <button
                        type="button"
                        className="ghost mini"
                        onClick={() => setEditing({ service: definition.service, connection: row })}
                      >
                        Edit
                      </button>
                      {definition.service === 'google' &&
                        (row.secretsSet.includes('tokens') ? (
                          <a
                            className="ghost mini"
                            href={`/api/oauth/google/start?connection=${row.id}`}
                          >
                            Reconnect
                          </a>
                        ) : (
                          <a
                            className="ghost mini"
                            href={`/api/oauth/google/start?connection=${row.id}`}
                          >
                            Connect
                          </a>
                        ))}
                      <button
                        type="button"
                        className="danger mini"
                        onClick={() => setConfirming(row)}
                      >
                        Disconnect
                      </button>
                    </span>
                    {tests[row.id] && (
                      <span
                        className={`test-result${tests[row.id] === 'works' ? ' ok' : ''}`}
                        aria-live="polite"
                      >
                        {tests[row.id] === 'testing…' && <span className="spinner" aria-hidden="true" />}
                        {tests[row.id] === 'testing…' ? 'testing…' : tests[row.id]}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )
        })}
      </section>

      <form className="card settings" onSubmit={(event) => void savePreferences(event)}>
        <h2>Preferences</h2>
        <label>
          Briefing hour (0–23)
          <input
            type="number"
            min={0}
            max={23}
            value={briefingHour}
            onChange={(event) => setBriefingHour(Number(event.target.value))}
          />
        </label>
        <label>
          Digest window, hours
          <input
            type="number"
            min={1}
            value={windowHours}
            onChange={(event) => setWindowHours(Number(event.target.value))}
          />
        </label>
        <label>
          Never mention these mail senders (one per line)
          <textarea rows={3} value={senders} onChange={(event) => setSenders(event.target.value)} />
        </label>
        <label>
          Hide vault folders from the dashboard (prefixes, one per line)
          <textarea
            rows={2}
            value={vaultPrefixes}
            onChange={(event) => setVaultPrefixes(event.target.value)}
          />
        </label>
        <label>
          Ignore these browser domains (one per line)
          <textarea
            rows={2}
            value={browserDomains}
            onChange={(event) => setBrowserDomains(event.target.value)}
          />
        </label>
        <fieldset className="sources">
          <legend>Sources in the briefing</legend>
          {Object.entries(SOURCE_LABELS).map(([source, label]) => (
            <label key={source} className="check">
              <input
                type="checkbox"
                checked={enabled.includes(source)}
                onChange={(event) =>
                  setEnabled((current) =>
                    event.target.checked
                      ? [...current, source]
                      : current.filter((item) => item !== source),
                  )
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="row">
          <button type="submit" className="primary">
            Save preferences
          </button>
        </div>
      </form>

      {editing && (
        <ConnectionForm
          definition={SERVICES.find((entry) => entry.service === editing.service)!}
          connection={editing.connection}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            setEditing(null)
            await loadConnections()
            setNotice({
              text:
                saved.service === 'google' && !saved.secretsSet.includes('tokens')
                  ? 'Saved. Press Connect next to the Google account to grant access.'
                  : `Saved ${saved.label}.`,
              tone: 'success',
            })
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Disconnect account"
          message={`Disconnect “${confirming.label}”? Its local data will be removed from the dashboard.`}
          confirmLabel="Disconnect"
          onConfirm={() => void confirmDisconnect()}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

function Hint({ text }: { text: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <span
      className={`hint${open ? ' open' : ''}`}
      tabIndex={0}
      role="note"
      aria-describedby={id}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false)
          event.currentTarget.blur()
        }
      }}
    >
      ?
      <span className="tip" id={id} role="tooltip">
        {text}
      </span>
    </span>
  )
}

function isHealthy(connection: Connection): boolean {
  if (!connection.enabled || connection.lastError) return false
  switch (connection.service) {
    case 'vault':
      return true
    case 'browser':
      return true
    case 'deepseek':
      return connection.secretsSet.includes('key')
    case 'google':
      return connection.secretsSet.includes('tokens')
    case 'imap':
      return connection.secretsSet.includes('password')
    case 'github':
      return connection.secretsSet.includes('token')
    default:
      return false
  }
}

function detailOf(connection: Connection): string {
  switch (connection.service) {
    case 'vault':
      return connection.config.path ?? ''
    case 'imap':
      return connection.secretsSet.includes('password') ? 'app password set' : 'no password'
    case 'browser':
      return connection.config.path || 'auto-detect'
    case 'google':
      return connection.secretsSet.includes('tokens') ? 'connected' : 'not connected'
    case 'github':
      return connection.secretsSet.includes('token') ? 'token set' : 'no token'
    case 'deepseek':
      return connection.secretsSet.includes('key') ? 'key saved' : 'no key'
    default:
      return ''
  }
}

function ConnectionForm({
  definition,
  connection,
  onClose,
  onSaved,
}: {
  definition: ServiceDef
  connection?: Connection
  onClose: () => void
  onSaved: (saved: Connection) => void | Promise<void>
}) {
  const [label, setLabel] = useState(connection?.label ?? definition.name)
  const [enabled, setEnabled] = useState(connection?.enabled ?? true)
  const [config, setConfig] = useState<Record<string, string>>(connection?.config ?? {})
  const [secret, setSecret] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, textarea, button, a[href]',
      )
      if (!nodes || nodes.length === 0) return
      const list = [...nodes].filter((node) => !node.hasAttribute('disabled'))
      const first = list[0]
      const last = list[list.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [onClose])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const input: ConnectionInput = { service: definition.service, label, config, secret, enabled }
    try {
      const saved = connection
        ? await api.updateConnection(connection.id, input)
        : await api.addConnection(input)
      await onSaved(saved)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        ref={dialogRef}
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-label={connection ? 'Edit connection' : `Connect ${definition.name}`}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <h2>{connection ? 'Edit connection' : `Connect ${definition.name}`}</h2>
        <label>
          Label
          <input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        {definition.fields.map((field) => (
          <label key={field.key}>
            {field.label}
            {field.optional ? ' (optional)' : ''}
            <input
              type={field.secret ? 'password' : 'text'}
              placeholder={field.placeholder}
              value={field.secret ? (secret[field.key] ?? '') : (config[field.key] ?? '')}
              onChange={(event) =>
                field.secret
                  ? setSecret((current) => ({ ...current, [field.key]: event.target.value }))
                  : setConfig((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
            {field.secret && connection?.secretsSet.includes(field.key) && (
              <span className="sub">already saved — leave empty to keep it</span>
            )}
          </label>
        ))}
        {connection && (
          <label className="check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enabled
          </label>
        )}
        {error && (
          <p className="note error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary">
            {connection ? 'Save changes' : 'Add connection'}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    const timer = setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    }, 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
      previous?.focus()
    }
  }, [onCancel])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form
        ref={dialogRef}
        className="modal card confirm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm()
        }}
      >
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="row">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="danger">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
