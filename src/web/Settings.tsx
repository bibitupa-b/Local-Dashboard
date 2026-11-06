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
import { applyAppearance } from './appearance.js'
import { WIDGET_LABELS, type WidgetId, type WidgetLayout } from '../shared/widgets.js'

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
2. Enable "Google Drive API", "Google Calendar API" and "Google Tasks API" in Library.
3. OAuth consent screen: External; publish to Production (Testing expires tokens in 7 days).
4. Credentials -> Create credentials -> OAuth client ID -> Desktop app.
5. Paste Client ID and Client secret, save, then press Connect.`,
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: '...apps.googleusercontent.com' },
      { key: 'clientSecret', label: 'Client secret', secret: true, placeholder: 'GOCSPX-...' },
      {
        key: 'calendarIds',
        label: 'Calendar IDs',
        optional: true,
        placeholder: 'primary, work',
      },
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
        label: 'History file',
        optional: true,
        placeholder: 'auto-detect',
      },
    ],
  },
  {
    service: 'weather',
    name: 'Weather',
    description: 'Today’s forecast from Open-Meteo.',
    hint: `Find your coordinates at openstreetmap.org (right-click → Show address).
Open-Meteo needs no API key. The briefing gets today's range, conditions and rain chance.`,
    fields: [
      { key: 'latitude', label: 'Latitude', placeholder: '55.7558' },
      { key: 'longitude', label: 'Longitude', placeholder: '37.6173' },
    ],
  },
  {
    service: 'rss',
    name: 'RSS / News',
    description: 'A few feeds for the morning headlines.',
    hint: `Paste one or more RSS/Atom URLs, separated by commas.
Only titles and short summaries reach the briefing; the feed is fetched on this machine.`,
    fields: [
      {
        key: 'feeds',
        label: 'Feed URLs',
        placeholder: 'https://example.com/rss.xml, https://example.com/atom.xml',
      },
    ],
  },
  {
    service: 'slack',
    name: 'Slack',
    description: 'Mentions and DMs from the last 24 hours.',
    hint: `1. Create a Slack app at api.slack.com/apps.
2. Give it read scopes: channels:history, groups:history, im:history, mpim:history, users:read.
3. Install it and paste the user or bot token.
4. Leave User ID empty to use the token owner; set it when a bot token should watch a person.`,
    fields: [
      { key: 'token', label: 'Token', secret: true, placeholder: 'xoxp-... or xoxb-...' },
      {
        key: 'userId',
        label: 'User ID',
        optional: true,
        placeholder: 'U01234567',
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
  weather: 'weather',
  rss: 'rss',
  tasks: 'google tasks',
  slack: 'slack',
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
      else void commitRef.current(latest.current).catch(() => {})
    }
  }, [])

  return { draft, receipt, edit, retry: () => void send() }
}

function FieldNote({ receipt, onRetry }: { receipt: Receipt | null; onRetry: () => void }) {  if (!receipt) return null
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

/**
 * A list of values edited as chips: each one readable and removable on its own, instead of a
 * textarea whose line breaks silently decide what the server gets.
 */
function ListEditor({
  id,
  label,
  hint,
  placeholder,
  values,
  wide,
  onChange,
  receipt,
  onRetry,
}: {
  id: string
  label: string
  hint: string
  placeholder: string
  values: string[]
  wide?: boolean
  onChange: (next: string[]) => void
  receipt: Receipt | null
  onRetry: () => void
}) {
  const [draft, setDraft] = useState('')

  function add(): void {
    const value = draft.trim()
    if (!value) return
    setDraft('')
    if (values.includes(value)) return
    onChange([...values, value])
  }

  return (
    <div className={`pref${wide ? ' pref--wide' : ''}`}>
      <div className="pref-head">
        <label htmlFor={id}>{label}</label>
        <FieldNote receipt={receipt} onRetry={onRetry} />
      </div>
      <div className="list-edit">
        {values.length > 0 && (
          <ul className="list-edit__items">
            {values.map((value) => (
              <li key={value} className="list-edit__item">
                <span lang={contentLang(value)}>{value}</span>
                <button
                  type="button"
                  className="list-edit__remove"
                  aria-label={`Remove ${value}`}
                  onClick={() => onChange(values.filter((item) => item !== value))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="list-edit__add">
          <input
            id={id}
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              add()
            }}
          />
          <button
            type="button"
            className="btn btn--ghost btn--mini"
            onClick={add}
            disabled={draft.trim().length === 0}
          >
            Add
          </button>
        </div>
        <p className="hint-text">{hint}</p>
      </div>
    </div>
  )
}

const MOTIONS: Array<{ id: Settings['appearance']['motion']; label: string }> = [
  { id: 'calm', label: 'Calm' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'lively', label: 'Lively' },
]

/** One appearance knob: a square track with the default marked, and a way back to it. */
function AppearanceSlider({
  id,
  label,
  value,
  min,
  max,
  unit,
  defaultValue,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  unit: string
  defaultValue: number
  onChange: (value: number) => void
}) {
  const tick = ((defaultValue - min) / (max - min)) * 100
  return (
    <div className="appearance__block">
      <div className="appearance__head">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <span className="appearance__tail">
          <span className="appearance__value" aria-hidden="true">
            {value}
            {unit}
          </span>
          <button
            type="button"
            className="slider__reset"
            aria-label={`Reset ${label} to ${defaultValue}${unit}`}
            title={`Reset to ${defaultValue}${unit}`}
            disabled={value === defaultValue}
            onClick={() => onChange(defaultValue)}
          >
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <path
                d="M3.2 3.4a4 4 0 1 1-1.1 3.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <path
                d="M2.5 1.6v2.2h2.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </span>
      </div>
      <div className="slider">
        <span className="slider__rail">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <span className="slider__tick" style={{ left: `${tick}%` }} aria-hidden="true" />
        </span>
      </div>
    </div>
  )
}

export function SettingsPanel({
  settings,
  onSaved,
  onClose,
  hues = [28, 158, 220],
}: {
  settings: Settings
  onSaved: (next: Settings) => void
  onClose: () => void
  hues?: [number, number, number]
}) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [editing, setEditing] = useState<{ service: Service; connection?: Connection } | null>(null)
  const [confirming, setConfirming] = useState<Connection | null>(null)
  const [confirmingData, setConfirmingData] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [tests, setTests] = useState<Record<string, string>>({})
  const navRef = useRef<HTMLElement>(null)

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

  const work = useLiveSave(
    { start: settings.workStart ?? 9, end: settings.workEnd ?? 19 },
    async (value) => {
      await api.saveSettings({ workStart: value.start, workEnd: value.end })
      remember({ workStart: value.start, workEnd: value.end })
    },
    {
      accept: (value) =>
        Number.isInteger(value.start) &&
        Number.isInteger(value.end) &&
        value.start >= 0 &&
        value.end <= 23 &&
        value.start < value.end,
      hint: 'Start and end must be whole hours, start before end',
    },
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

  const meeting = useLiveSave(settings.meetingPrep ?? true, async (value) => {
    await api.saveSettings({ meetingPrep: value })
    remember({ meetingPrep: value })
  })

  const retention = useLiveSave(
    {
      mail: settings.mailBodyDays ?? 90,
      browser: settings.browserDays ?? 90,
      vault: settings.vaultChangeDays ?? 365,
    },
    async (value) => {
      await api.saveSettings({
        mailBodyDays: value.mail,
        browserDays: value.browser,
        vaultChangeDays: value.vault,
      })
      remember({
        mailBodyDays: value.mail,
        browserDays: value.browser,
        vaultChangeDays: value.vault,
      })
    },
    {
      accept: (value) =>
        [value.mail, value.browser, value.vault].every(
          (days) => Number.isInteger(days) && days >= 1 && days <= 3650,
        ),
      hint: '1–3650 days',
    },
  )

  const wallpaper = useLiveSave(settings.wallpaper, async (value) => {
    await api.saveSettings({ wallpaper: value })
    remember({ wallpaper: value })
  })

  const appearance = useLiveSave(settings.appearance, async (value) => {
    await api.saveSettings({ appearance: value })
    remember({ appearance: value })
  })

  const widgets = useLiveSave(settings.widgets, async (value) => {
    await api.saveSettings({ widgets: value })
    remember({ widgets: value })
  })

  const grounding = useLiveSave(settings.groundingStrict, async (value) => {
    await api.saveSettings({ groundingStrict: value })
    remember({ groundingStrict: value })
  })

  // Sliders preview instantly; the debounced save keeps the last value.
  function changeAppearance(patch: Partial<Settings['appearance']>): void {
    const next = { ...appearance.draft, ...patch }
    applyAppearance(next)
    appearance.edit(next)
  }

  function patchWidget(id: WidgetId, change: Partial<WidgetLayout>): void {
    const current = widgets.draft.find((item) => item.id === id)
    const next = widgets.draft.map((item) => (item.id === id ? { ...item, ...change } : item))
    if (change.slot && current && change.slot !== current.slot) {
      const moved = next.find((item) => item.id === id)
      const max = widgets.draft
        .filter((item) => item.slot === change.slot && item.id !== id)
        .reduce((value, item) => Math.max(value, item.order), -1)
      if (moved) moved.order = max + 1
    }
    widgets.edit(next)
  }

  function moveWidget(id: WidgetId, delta: number): void {
    const sorted = [...widgets.draft].sort((a, b) => a.order - b.order)
    const index = sorted.findIndex((item) => item.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= sorted.length) return
    const [moved] = sorted.splice(index, 1)
    sorted.splice(target, 0, moved!)
    widgets.edit(sorted.map((item, order) => ({ ...item, order })))
  }

  const senders = useLiveSave(settings.excludedSenders, async (list) => {
    await api.saveSettings({ excludedSenders: list })
    remember({ excludedSenders: list })
  })

  const mailFolders = useLiveSave(settings.excludedMailFolders, async (list) => {
    await api.saveSettings({ excludedMailFolders: list })
    remember({ excludedMailFolders: list })
  })

  const vaultPrefixes = useLiveSave(settings.excludedVaultPrefixes, async (list) => {
    await api.saveSettings({ excludedVaultPrefixes: list })
    remember({ excludedVaultPrefixes: list })
  })

  const browserDomains = useLiveSave(settings.excludedBrowserDomains, async (list) => {
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

  const fields = [hour, work, windowHours, evening, meeting, retention, language, profile, senders, mailFolders, vaultPrefixes, browserDomains, sources, wallpaper, appearance, widgets, grounding]
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
      // The highlight is one pane that slides to the current section, not a class that blinks.
      const nav = navRef.current
      const activeLink = links.find((link) => link.classList.contains('is-active'))
      if (nav && activeLink) {
        nav.style.setProperty('--thumb-y', `${activeLink.offsetTop}px`)
        nav.style.setProperty('--thumb-h', `${activeLink.offsetHeight}px`)
        nav.style.setProperty('--thumb-x', `${activeLink.offsetLeft}px`)
        nav.style.setProperty('--thumb-w', `${activeLink.offsetWidth}px`)
        nav.classList.add('is-measured')
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

  async function exportData(): Promise<void> {
    try {
      const blob = await api.exportData()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `local-dashboard-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setNotice({ text: 'Export downloaded.', tone: 'success' })
    } catch (error) {
      setNotice({
        text: friendlyError(error instanceof Error ? error.message : String(error)),
        tone: 'error',
      })
    }
  }

  async function deleteData(): Promise<void> {
    setConfirmingData(false)
    try {
      await api.deleteData()
      window.location.reload()
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
        <nav className="settings-nav" aria-label="Settings sections" ref={navRef}>
          <span className="settings-nav__thumb" aria-hidden="true" />
          <a className="settings-nav__link is-active" href="#section-connections">
            Connections
          </a>
          <a className="settings-nav__link" href="#section-application">
            Application
          </a>
          <a className="settings-nav__link" href="#section-preferences">
            Preferences
          </a>
          <a className="settings-nav__link" href="#section-appearance">
            Appearance
          </a>
          <a className="settings-nav__link" href="#section-widgets">
            Widgets
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
                  className="btn btn--ghost btn--mini conn-add"
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
                      {row.lastSync
                        ? ` · synced ${new Date(row.lastSync).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`
                        : ''}
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
                      {definition.service === 'google' && (
                        // A new window is intercepted by Electron and opened in the system browser,
                        // so the dashboard itself never navigates away.
                        <a
                          className="btn btn--ghost btn--mini"
                          href={`/api/oauth/google/start?connection=${row.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {row.secretsSet.includes('tokens') ? 'Reconnect' : 'Connect'}
                        </a>
                      )}
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
          <button type="button" className="btn btn--ghost" onClick={() => void exportData()}>
            Export data
          </button>
          <button type="button" className="btn btn--danger" onClick={() => setConfirmingData(true)}>
            Delete local data
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
              <span className="field-label">Work hours for free windows</span>
              <FieldNote receipt={work.receipt} onRetry={work.retry} />
            </div>
            <div className="row">
              <input
                aria-label="Work day start"
                type="number"
                min={0}
                max={22}
                value={work.draft.start}
                onChange={(event) =>
                  work.edit({ ...work.draft, start: Number(event.target.value) })
                }
              />
              <span>to</span>
              <input
                aria-label="Work day end"
                type="number"
                min={1}
                max={23}
                value={work.draft.end}
                onChange={(event) =>
                  work.edit({ ...work.draft, end: Number(event.target.value) })
                }
              />
            </div>
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
              <label htmlFor="pref-meeting-prep">Meeting prep</label>
              <FieldNote receipt={meeting.receipt} onRetry={meeting.retry} />
            </div>
            <label className="check">
              <input
                id="pref-meeting-prep"
                type="checkbox"
                checked={meeting.draft}
                onChange={(event) => meeting.edit(event.target.checked)}
              />
              A short heads-up 30 minutes before a meeting
            </label>
          </div>

          <div className="pref pref--wide">
            <div className="pref-head">
              <span className="field-label">Keep local data for</span>
              <FieldNote receipt={retention.receipt} onRetry={retention.retry} />
            </div>
            <div className="row">
              <label className="check">
                Mail
                <input
                  aria-label="Mail retention days"
                  type="number"
                  min={1}
                  max={3650}
                  value={retention.draft.mail}
                  onChange={(event) =>
                    retention.edit({ ...retention.draft, mail: Number(event.target.value) })
                  }
                />
              </label>
              <label className="check">
                Browser
                <input
                  aria-label="Browser retention days"
                  type="number"
                  min={1}
                  max={3650}
                  value={retention.draft.browser}
                  onChange={(event) =>
                    retention.edit({ ...retention.draft, browser: Number(event.target.value) })
                  }
                />
              </label>
              <label className="check">
                Diffs
                <input
                  aria-label="Vault change retention days"
                  type="number"
                  min={1}
                  max={3650}
                  value={retention.draft.vault}
                  onChange={(event) =>
                    retention.edit({ ...retention.draft, vault: Number(event.target.value) })
                  }
                />
              </label>
            </div>
          </div>

          <div className="pref">
            <div className="pref-head">
              <span className="field-label">Strict grounding</span>
              <FieldNote receipt={grounding.receipt} onRetry={grounding.retry} />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={grounding.draft}
                onChange={(event) => grounding.edit(event.target.checked)}
              />
              Re-check every point against the digest and drop what it cannot support. Uses extra
              tokens.
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

          <ListEditor
            id="pref-senders"
            label="Never mention these mail senders"
            hint="Press Enter to add one address at a time."
            placeholder="newsletter@example.com"
            values={senders.draft}
            wide
            onChange={senders.edit}
            receipt={senders.receipt}
            onRetry={senders.retry}
          />

          <ListEditor
            id="pref-folders"
            label="Ignore these mail folders"
            hint="Folder names or fragments. Press Enter to add one at a time."
            placeholder="Archive"
            values={mailFolders.draft}
            wide
            onChange={mailFolders.edit}
            receipt={mailFolders.receipt}
            onRetry={mailFolders.retry}
          />

          <ListEditor
            id="pref-vault"
            label="Hide vault folders from the start line and briefing"
            hint="Prefixes. Press Enter to add one at a time."
            placeholder="02 areas/🎒 body and health"
            values={vaultPrefixes.draft}
            wide
            onChange={vaultPrefixes.edit}
            receipt={vaultPrefixes.receipt}
            onRetry={vaultPrefixes.retry}
          />

          <ListEditor
            id="pref-domains"
            label="Ignore these browser domains"
            hint="Press Enter to add one domain at a time."
            placeholder="f95zone.to"
            values={browserDomains.draft}
            wide
            onChange={browserDomains.edit}
            receipt={browserDomains.receipt}
            onRetry={browserDomains.retry}
          />

          <fieldset className="sources">
            <legend>
              Sources in the briefing · {sources.draft.length} of{' '}
              {Object.keys(SOURCE_LABELS).length}
            </legend>
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
                <span className="check__box" aria-hidden="true">
                  <svg className="check__mark" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.4 6.3l2.4 2.4 4.8-5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
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

      <section className="card" id="section-appearance" aria-labelledby="appearance">
        <div className="card-head">
          <h2 id="appearance" className="card__title">Appearance</h2>
        </div>

        <div className="appearance">
          <div className="appearance__block">
            <div className="appearance__head">
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
            <p className="sub">
              Aurora stays the default; a picture also sets the interface colours.
            </p>
          </div>

          <AppearanceSlider
            id="ap-blur"
            label="Blur"
            value={appearance.draft.blur}
            min={0}
            max={30}
            unit=" px"
            defaultValue={14}
            onChange={(blur) => changeAppearance({ blur })}
          />

          <AppearanceSlider
            id="ap-glass"
            label="Glass density"
            value={appearance.draft.glass}
            min={60}
            max={150}
            unit="%"
            defaultValue={100}
            onChange={(glass) => changeAppearance({ glass })}
          />

          <AppearanceSlider
            id="ap-grain"
            label="Grain"
            value={appearance.draft.grain}
            min={0}
            max={20}
            unit="%"
            defaultValue={12}
            onChange={(grain) => changeAppearance({ grain })}
          />

          <AppearanceSlider
            id="ap-shadow"
            label="Panel shadow"
            value={appearance.draft.shadow}
            min={0}
            max={100}
            unit="%"
            defaultValue={100}
            onChange={(shadow) => changeAppearance({ shadow })}
          />

          <AppearanceSlider
            id="ap-photo"
            label="Wallpaper brightness"
            value={appearance.draft.photo}
            min={70}
            max={100}
            unit="%"
            defaultValue={94}
            onChange={(photo) => changeAppearance({ photo })}
          />

          <div className="appearance__block">
            <div className="appearance__head">
              <span className="field-label">Accent</span>
              <FieldNote receipt={appearance.receipt} onRetry={appearance.retry} />
            </div>
            <div className="accent-row">
              <button
                type="button"
                className="accent-swatch accent-swatch--auto"
                aria-pressed={appearance.draft.accent === null}
                onClick={() => changeAppearance({ accent: null })}
              >
                Auto
              </button>
              {hues.map((hue) => (
                <button
                  key={hue}
                  type="button"
                  className="accent-swatch"
                  aria-label={`Accent ${Math.round(hue)} degrees`}
                  aria-pressed={Math.round(hue) === appearance.draft.accent}
                  style={{ background: `hsl(${Math.round(hue)} 62% 68%)` }}
                  onClick={() => changeAppearance({ accent: Math.round(hue) })}
                />
              ))}
            </div>
            <div className="accent-hue slider">
              <input
                type="range"
                min={0}
                max={359}
                value={appearance.draft.accent ?? 0}
                aria-label="Accent hue"
                onChange={(event) => changeAppearance({ accent: Number(event.target.value) })}
              />
              <span className="appearance__value">
                {appearance.draft.accent === null ? 'auto' : `${appearance.draft.accent}°`}
              </span>
            </div>
            <p className="sub">
              Auto takes three hues from the picture; a picked hue rotates the other two around it.
            </p>
          </div>

          <div className="appearance__block">
            <div className="appearance__head">
              <span className="field-label">Animation</span>
            </div>
            <div className="motion" role="group" aria-label="Animation">
              {MOTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={appearance.draft.motion === item.id}
                  onClick={() => changeAppearance({ motion: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="sub">
              Calm drops the shine, parallax and stagger; Lively speeds them up. System reduced
              motion wins either way.
            </p>
          </div>
        </div>
      </section>

      <section className="card" id="section-widgets" aria-labelledby="widgets">
        <div className="card-head">
          <h2 id="widgets" className="card__title">Widgets</h2>
          <FieldNote receipt={widgets.receipt} onRetry={widgets.retry} />
        </div>
        <p className="card__sub">
          Live cards for the empty gutters of a wide window. On a narrow window side widgets fold
          inline above the briefing unless you choose to hide them.
        </p>
        <div className="widget-list">
          {[...widgets.draft]
            .sort((a, b) => a.order - b.order)
            .map((item) => (
              <div className="widget-row" key={item.id}>
                <span className="widget-row__name">{WIDGET_LABELS[item.id]}</span>
                <select
                  aria-label={`${WIDGET_LABELS[item.id]} placement`}
                  value={item.slot}
                  onChange={(event) =>
                    patchWidget(item.id, { slot: event.target.value as WidgetLayout['slot'] })
                  }
                >
                  <option value="left">Left column</option>
                  <option value="right">Right column</option>
                  <option value="inline">Inline</option>
                  <option value="hidden">Hidden</option>
                </select>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!item.collapsed}
                    onChange={(event) => patchWidget(item.id, { collapsed: !event.target.checked })}
                  />
                  Open
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={item.wide}
                    onChange={(event) => patchWidget(item.id, { wide: event.target.checked })}
                  />
                  Wider
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={item.narrow === 'inline'}
                    onChange={(event) =>
                      patchWidget(item.id, { narrow: event.target.checked ? 'inline' : 'hide' })
                    }
                  />
                  Inline when narrow
                </label>
                <span className="widget-row__order">
                  <button
                    type="button"
                    className="btn btn--ghost btn--mini"
                    aria-label={`Move ${WIDGET_LABELS[item.id]} up`}
                    onClick={() => moveWidget(item.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--mini"
                    aria-label={`Move ${WIDGET_LABELS[item.id]} down`}
                    onClick={() => moveWidget(item.id, 1)}
                  >
                    ↓
                  </button>
                </span>
              </div>
            ))}
        </div>
        <p className="sub">
          In a wide window you can also drag a widget by its header between the left and right
          columns.
        </p>
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

      {confirmingData &&
        createPortal(
          <ConfirmDialog
            title="Delete local data"
            message="Delete indexed notes, mail, calendar, Drive, browser history, briefings and preferences? Connections and their keys stay, so you can sync again."
            confirmLabel="Delete data"
            onConfirm={() => void deleteData()}
            onCancel={() => setConfirmingData(false)}
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
    case 'browser':
      return connection.configured !== false
    case 'deepseek':
      return connection.secretsSet.includes('key')
    case 'google':
      return connection.secretsSet.includes('tokens')
    case 'imap':
      return connection.secretsSet.includes('password')
    case 'github':
      return connection.secretsSet.includes('token')
    case 'weather':
      return Boolean(connection.config.latitude && connection.config.longitude)
    case 'rss':
      return Boolean(connection.config.feeds?.trim())
    case 'slack':
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
    case 'weather':
      return connection.config.latitude && connection.config.longitude
        ? `${connection.config.latitude}, ${connection.config.longitude}`
        : 'coordinates missing'
    case 'rss':
      return connection.config.feeds ? `${connection.config.feeds.split(',').length} feeds` : 'no feeds'
    case 'slack':
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
                  {field.optional && !/optional/i.test(field.label) ? ' (optional)' : ''}
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
