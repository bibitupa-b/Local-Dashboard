import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  api,
  type Connection,
  type ConnectionInput,
  type Service,
  type Settings,
} from './api.js'
import { friendlyError } from './errors.js'
import { contentLang } from './lang.js'
import { useDialog, useLeaving } from './useDialog.js'
import { WALLPAPERS } from './wallpapers.js'

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

type Receipt = { state: 'saving' | 'saved' | 'error' | 'invalid'; at: number; reason?: string }

function clock(at: number): string {
  const date = new Date(at)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * One field that saves itself. The value stays on screen while it is written, and the receipt
 * says what the server actually holds: a failed save never silently keeps an unsaved value.
 */
function useLiveSave<T>(
  initial: T,
  commit: (value: T) => Promise<void>,
  options: { accept?: (value: T) => boolean; hint?: string; delay?: number } = {},
) {
  const [draft, setDraft] = useState(initial)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const latest = useRef(initial)
  const stored = useRef(initial)
  const valid = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sending = useRef(false)
  const repeat = useRef(false)
  const alive = useRef(true)
  const commitRef = useRef(commit)
  const optionsRef = useRef(options)

  useEffect(() => {
    commitRef.current = commit
    optionsRef.current = options
  })

  async function send(): Promise<void> {
    if (sending.current) {
      repeat.current = true
      return
    }
    if (latest.current === stored.current) return
    sending.current = true
    const value = latest.current
    if (alive.current) setReceipt({ state: 'saving', at: Date.now() })
    try {
      await commitRef.current(value)
      stored.current = value
      if (alive.current) setReceipt({ state: 'saved', at: Date.now() })
    } catch (error) {
      if (alive.current) {
        setReceipt({
          state: 'error',
          at: Date.now(),
          reason: friendlyError(error instanceof Error ? error.message : String(error)),
        })
      }
    } finally {
      sending.current = false
    }
    if (repeat.current) {
      repeat.current = false
      void send()
    }
  }

  function edit(next: T): void {
    latest.current = next
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    const { accept, hint } = optionsRef.current
    valid.current = !accept || accept(next)
    if (!valid.current) {
      setReceipt({ state: 'invalid', at: Date.now(), reason: hint })
      return
    }
    // Back on the value the server already holds: there is nothing left to report.
    if (next === stored.current) {
      setReceipt(null)
      return
    }
    timer.current = setTimeout(() => void send(), optionsRef.current.delay ?? 500)
  }

  // Leaving the route mid-edit must still write the last valid value.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current) clearTimeout(timer.current)
      if (!valid.current || latest.current === stored.current) return
      if (sending.current) repeat.current = true
      else void commitRef.current(latest.current)
    }
  }, [])

  return { draft, receipt, edit, retry: () => void send() }
}

function FieldNote({ receipt, onRetry }: { receipt: Receipt | null; onRetry: () => void }) {
  if (!receipt) return null
  if (receipt.state === 'saving') return <span className="field-note">Saving…</span>
  if (receipt.state === 'saved')
    return (
      <span key={receipt.at} className="field-note ok">
        Saved {clock(receipt.at)}
      </span>
    )
  if (receipt.state === 'invalid')
    return <span className="field-note">{receipt.reason ?? 'Not a valid value'}</span>
  return (
    <span className="field-note bad">
      {receipt.reason ?? 'Not saved'}{' '}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </span>
  )
}

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

  // Autosave is the affordance: every field writes itself and carries its own receipt.
  const latestSettings = useRef(settings)

  function remember(patch: Partial<Settings>): void {
    latestSettings.current = { ...latestSettings.current, ...patch }
    onSaved(latestSettings.current)
  }

  const hour = useLiveSave(
    String(settings.briefingHour),
    async (raw) => {
      await api.saveSettings({ briefingHour: Number(raw) })
      remember({ briefingHour: Number(raw) })
    },
    { accept: (raw) => /^\d{1,2}$/.test(raw) && Number(raw) <= 23, hint: '0–23' },
  )

  const windowHours = useLiveSave(
    String(settings.digestWindowHours),
    async (raw) => {
      await api.saveSettings({ digestWindowHours: Number(raw) })
      remember({ digestWindowHours: Number(raw) })
    },
    { accept: (raw) => /^\d+$/.test(raw) && Number(raw) >= 1, hint: '1 or more' },
  )

  const language = useLiveSave(settings.briefingLanguage, async (value) => {
    await api.saveSettings({ briefingLanguage: value })
    remember({ briefingLanguage: value })
  })

  const profile = useLiveSave(settings.briefingProfile, async (value) => {
    await api.saveSettings({ briefingProfile: value })
    remember({ briefingProfile: value })
  })

  const evening = useLiveSave(settings.eveningPass, async (value) => {
    await api.saveSettings({ eveningPass: value })
    remember({ eveningPass: value })
  })

  const wallpaper = useLiveSave(settings.wallpaper, async (value) => {
    await api.saveSettings({ wallpaper: value })
    remember({ wallpaper: value })
  })

  const senders = useLiveSave(settings.excludedSenders.join('\n'), async (raw) => {
    const list = lines(raw)
    await api.saveSettings({ excludedSenders: list })
    remember({ excludedSenders: list })
  })

  const vaultPrefixes = useLiveSave(settings.excludedVaultPrefixes.join('\n'), async (raw) => {
    const list = lines(raw)
    await api.saveSettings({ excludedVaultPrefixes: list })
    remember({ excludedVaultPrefixes: list })
  })

  const browserDomains = useLiveSave(settings.excludedBrowserDomains.join('\n'), async (raw) => {
    const list = lines(raw)
    await api.saveSettings({ excludedBrowserDomains: list })
    remember({ excludedBrowserDomains: list })
  })

  const sources = useLiveSave(
    settings.enabledSources.length > 0 ? settings.enabledSources : Object.keys(SOURCE_LABELS),
    async (list) => {
      await api.saveSettings({ enabledSources: list })
      remember({ enabledSources: list })
    },
  )

  const fields = [hour, windowHours, evening, language, profile, senders, vaultPrefixes, browserDomains, sources, wallpaper]
  const receipts = fields.map((field) => field.receipt)
  const unsaved = receipts.filter((receipt) => receipt?.state === 'error').length
  const saving = receipts.some((receipt) => receipt?.state === 'saving')
  const lastSaved = receipts.reduce(
    (last, receipt) => (receipt?.state === 'saved' ? Math.max(last, receipt.at) : last),
    0,
  )
  const saveState = unsaved
    ? `${unsaved} change${unsaved === 1 ? '' : 's'} not saved`
    : saving
      ? 'Saving…'
      : lastSaved
        ? `All changes saved ${clock(lastSaved)}`
        : 'Changes save as you edit'

  async function loadConnections() {
    const { items } = await api.connections()
    setConnections(items)
  }

  useEffect(() => {
    void loadConnections().catch((error: unknown) =>
      setNotice({
        text: friendlyError(error instanceof Error ? error.message : String(error)),
        tone: 'error',
      }),
    )
  }, [])

  // A success message is a receipt, not a state: it should not sit on the page forever.
  useEffect(() => {
    if (!notice || notice.tone === 'error') return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.stage')
    const sections = [...document.querySelectorAll<HTMLElement>('.settings-content .card')]
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.settings-nav__link')]
    if (!root || sections.length === 0) return undefined
    const update = () => {
      const line = root.getBoundingClientRect().top + 96
      // Above the first card nothing has crossed the line yet; keep the first section current.
      const current =
        sections.filter((section) => section.getBoundingClientRect().top <= line).at(-1) ??
        sections[0]
      for (const link of links) {
        const active = link.getAttribute('href') === `#${current?.id}`
        link.classList.toggle('is-active', active)
        if (active) link.setAttribute('aria-current', 'location')
        else link.removeAttribute('aria-current')
      }
    }
    update()
    root.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      root.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  async function test(connection: Connection) {
    setTests((current) => ({ ...current, [connection.id]: 'testing…' }))
    try {
      const result = await api.testConnection(connection.id)
      setTests((current) => ({
        ...current,
        [connection.id]: result.ok
          ? 'works'
          : friendlyError(result.error ?? 'Connection test failed'),
      }))
    } catch (error) {
      setTests((current) => ({
        ...current,
        [connection.id]: friendlyError(error instanceof Error ? error.message : String(error)),
      }))
    }
  }

  async function confirmDisconnect() {
    if (!confirming) return
    const target = confirming
    setConfirming(null)
    try {
      await api.deleteConnection(target.id)
      await loadConnections()
      setNotice({ text: `Removed ${target.label}.`, tone: 'success' })
    } catch (error) {
      setNotice({
        text: friendlyError(error instanceof Error ? error.message : String(error)),
        tone: 'error',
      })
    }
  }

  async function copyDiagnostics(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard is not available in this window')
      const status = await api.status()
      await navigator.clipboard.writeText(
        JSON.stringify({ dataDir: settings.dataDir, status, settings }, null, 2),
      )
      setNotice({ text: 'Diagnostics copied to the clipboard.', tone: 'success' })
    } catch (error) {
      setNotice({
        text: friendlyError(error instanceof Error ? error.message : String(error)),
        tone: 'error',
      })
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="settings-head__sub">Stored on this machine. Only the briefing digest leaves it.</p>
        </div>
        <button className="btn btn--ghost btn--pill" type="button" onClick={onClose}>
          Back to dashboard
        </button>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <a className="settings-nav__link is-active" href="#section-connections">
            Connections
          </a>
          <a className="settings-nav__link" href="#section-application">
            Application
          </a>
          <a className="settings-nav__link" href="#section-preferences">
            Preferences
          </a>
        </nav>

        <div className="settings-content">
          {notice && (
            <p className={`note ${notice.tone}`} role="status" aria-live="polite">
              {notice.text}
            </p>
          )}

      <section className="card" id="section-connections">
        <h2 className="card__title">Connections</h2>
        <p className="card__sub">
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
                  className="btn btn--ghost btn--mini"
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
                    <span className="label" lang={contentLang(row.label)}>
                      {row.label}
                    </span>
                    <span className="detail" lang={contentLang(detailOf(row))}>
                      {detailOf(row)}
                    </span>
                    <span className="conn-actions">
                      <button type="button" className="btn btn--ghost btn--mini" onClick={() => void test(row)}>
                        Test
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--mini"
                        onClick={() => setEditing({ service: definition.service, connection: row })}
                      >
                        Edit
                      </button>
                      {definition.service === 'google' &&
                        (row.secretsSet.includes('tokens') ? (
                          <a
                            className="btn btn--ghost btn--mini"
                            href={`/api/oauth/google/start?connection=${row.id}`}
                          >
                            Reconnect
                          </a>
                        ) : (
                          <a
                            className="btn btn--ghost btn--mini"
                            href={`/api/oauth/google/start?connection=${row.id}`}
                          >
                            Connect
                          </a>
                        ))}
                      <button
                        type="button"
                        className="btn btn--danger btn--mini"
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

      <section className="card" id="section-application">
        <h2 className="card__title">Application</h2>
        <p className="card__sub">
          Database, logs and backups live in{' '}
          <span className="detail" lang={contentLang(settings.dataDir)}>{settings.dataDir}</span>.
        </p>
        <div className="row">
          {window.dashboard && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => window.dashboard?.openDataFolder()}
            >
              Open data folder
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={() => void copyDiagnostics()}>
            Copy diagnostics
          </button>
          <a
            className="btn btn--ghost btn--mini"
            href="https://github.com/bibitupa-b/Local-Dashboard/releases/latest"
            target="_blank"
            rel="noreferrer"
          >
            Check for updates
          </a>
          {window.dashboard && (
            <button type="button" className="btn btn--danger" onClick={() => window.dashboard?.quit()}>
              Quit application
            </button>
          )}
        </div>
        {window.dashboard && (
          <p className="sub">
            Closing the window keeps the app in the tray. Use Quit above, the tray menu, or Ctrl+Q
            to stop the server.
          </p>
        )}
      </section>

      <section className="card settings" id="section-preferences" aria-labelledby="preferences">
        <div className="card-head">
          <h2 id="preferences" className="card__title">Preferences</h2>
          <span className={`save-state${unsaved > 0 ? ' bad' : ''}`} role="status" aria-live="polite">
            {saveState}
          </span>
        </div>

        <div className="prefs">
          <div className="pref">
            <div className="pref-head">
              <label htmlFor="pref-briefing-hour">Briefing hour (0–23)</label>
              <FieldNote receipt={hour.receipt} onRetry={hour.retry} />
            </div>
            <input
              id="pref-briefing-hour"
              type="number"
              min={0}
              max={23}
              value={hour.draft}
              onChange={(event) => hour.edit(event.target.value)}
            />
          </div>

          <div className="pref">
            <div className="pref-head">
              <label htmlFor="pref-window">Digest window, hours</label>
              <FieldNote receipt={windowHours.receipt} onRetry={windowHours.retry} />
            </div>
            <input
              id="pref-window"
              type="number"
              min={1}
              value={windowHours.draft}
              onChange={(event) => windowHours.edit(event.target.value)}
            />
          </div>

          <div className="pref">
            <div className="pref-head">
              <label htmlFor="pref-evening">Evening pass</label>
              <FieldNote receipt={evening.receipt} onRetry={evening.retry} />
            </div>
            <label className="check">
              <input
                id="pref-evening"
                type="checkbox"
                checked={evening.draft}
                onChange={(event) => evening.edit(event.target.checked)}
              />
              A short second briefing at 18:00, closing the day
            </label>
          </div>

          <div className="pref">
            <div className="pref-head">
              <label htmlFor="pref-language">Briefing language</label>
              <FieldNote receipt={language.receipt} onRetry={language.retry} />
            </div>
            <select
              id="pref-language"
              value={language.draft}
              onChange={(event) =>
                language.edit(event.target.value as Settings['briefingLanguage'])
              }
            >
              <option value="auto">Auto</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="pref">
            <div className="pref-head">
              <label htmlFor="pref-profile">Briefing context (what matters, and what not to show)</label>
              <FieldNote receipt={profile.receipt} onRetry={profile.retry} />
            </div>
            <textarea
              id="pref-profile"
              rows={3}
              maxLength={500}
              placeholder="I write in Russian; skip newsletters and tasks from Archive."
              value={profile.draft}
              onChange={(event) => profile.edit(event.target.value)}
            />
          </div>

          <div className="pref">
            <div className="pref-head">
              <label htmlFor="pref-senders">Never mention these mail senders (one per line)</label>
              <FieldNote receipt={senders.receipt} onRetry={senders.retry} />
            </div>
            <textarea
              id="pref-senders"
              rows={3}
              value={senders.draft}
              onChange={(event) => senders.edit(event.target.value)}
            />
          </div>

          <div className="pref">
            <div className="pref-head">
              <label htmlFor="pref-vault">
                Hide vault folders from the start line and briefing (prefixes, one per line)
              </label>
              <FieldNote receipt={vaultPrefixes.receipt} onRetry={vaultPrefixes.retry} />
            </div>
            <textarea
              id="pref-vault"
              rows={2}
              value={vaultPrefixes.draft}
              onChange={(event) => vaultPrefixes.edit(event.target.value)}
            />
          </div>

          <div className="pref">
            <div className="pref-head">
              <label htmlFor="pref-domains">Ignore these browser domains (one per line)</label>
              <FieldNote receipt={browserDomains.receipt} onRetry={browserDomains.retry} />
            </div>
            <textarea
              id="pref-domains"
              rows={2}
              value={browserDomains.draft}
              onChange={(event) => browserDomains.edit(event.target.value)}
            />
          </div>

          <div className="pref pref--wide">
            <div className="pref-head">
              <span className="field-label">App background</span>
              <FieldNote receipt={wallpaper.receipt} onRetry={wallpaper.retry} />
            </div>
            <div className="wallpapers" role="radiogroup" aria-label="App background">
              {WALLPAPERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={wallpaper.draft === item.id}
                  className={`wallpaper${wallpaper.draft === item.id ? ' is-active' : ''}${
                    item.id === 'aurora' ? ' wallpaper--aurora' : ''
                  }`}
                  onClick={() => wallpaper.edit(item.id)}
                  title={item.title}
                >
                  {item.thumb ? (
                    <img src={item.thumb} alt="" loading="lazy" />
                  ) : (
                    <span className="wallpaper__aurora" aria-hidden="true" />
                  )}
                  <span className="wallpaper__name">{item.title}</span>
                </button>
              ))}
            </div>
            <p className="sub">The image sits behind the glass; Aurora stays the default.</p>
          </div>

          <fieldset className="sources">
            <legend>Sources in the briefing</legend>
            {Object.entries(SOURCE_LABELS).map(([source, label]) => (
              <label key={source} className="check">
                <input
                  type="checkbox"
                  checked={sources.draft.includes(source)}
                  disabled={sources.draft.length === 1 && sources.draft.includes(source)}
                  onChange={(event) =>
                    sources.edit(
                      event.target.checked
                        ? [...sources.draft, source]
                        : sources.draft.filter((item) => item !== source),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="pref-foot">
            <p className="sub">At least one source stays in the briefing.</p>
            <FieldNote receipt={sources.receipt} onRetry={sources.retry} />
          </div>
        </div>
      </section>
        </div>
      </div>

      {/* A dialog is not page content: it leaves the Settings landmark, so `<main>` holds only the route. */}
      {editing &&
        createPortal(
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
          />,
          document.body,
        )}

      {confirming &&
        createPortal(
          <ConfirmDialog
            title="Disconnect account"
            message={`Disconnect “${confirming.label}”? Its local data will be removed from the dashboard.`}
            confirmLabel="Disconnect"
            onConfirm={() => void confirmDisconnect()}
            onCancel={() => setConfirming(null)}
          />,
          document.body,
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
  const { leaving, close } = useLeaving()
  const dialogRef = useDialog<HTMLFormElement>(true, () => close(onClose))
  const formId = useId()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const input: ConnectionInput = { service: definition.service, label, config, secret, enabled }
    try {
      const saved = connection
        ? await api.updateConnection(connection.id, input)
        : await api.addConnection(input)
      close(() => void onSaved(saved))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => close(onClose)}>
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
        <div className="modal__body">
          <div className="modal-field">
            <label htmlFor={`${formId}-label`}>Label</label>
            <input
              id={`${formId}-label`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          {definition.fields.map((field) => {
            const fieldId = `${formId}-${field.key}`
            const noteId = `${fieldId}-note`
            const saved = field.secret && connection?.secretsSet.includes(field.key)
            return (
              <div className="modal-field" key={field.key}>
                <label htmlFor={fieldId}>
                  {field.label}
                  {field.optional ? ' (optional)' : ''}
                </label>
                <input
                  id={fieldId}
                  type={field.secret ? 'password' : 'text'}
                  placeholder={field.placeholder}
                  aria-describedby={saved ? noteId : undefined}
                  value={field.secret ? (secret[field.key] ?? '') : (config[field.key] ?? '')}
                  onChange={(event) =>
                    field.secret
                      ? setSecret((current) => ({ ...current, [field.key]: event.target.value }))
                      : setConfig((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
                {saved && (
                  <span className="hint-text" id={noteId}>
                    already saved — leave empty to keep it
                  </span>
                )}
              </div>
            )
          })}
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
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => close(onClose)}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            {connection ? 'Save changes' : 'Add connection'}
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
  const { leaving, close } = useLeaving()
  const cancel = () => close(onCancel)
  const dialogRef = useDialog<HTMLFormElement>(true, cancel)
  // The consequence is the message, not the title: it has to reach the dialog's announcement.
  const messageId = useId()

  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={cancel}>
      <form
        ref={dialogRef}
        className="modal card confirm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          close(onConfirm)
        }}
      >
        <h2>{title}</h2>
        <p id={messageId}>{message}</p>
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={cancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--danger">
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
