import { Fragment, useEffect, useRef, useState } from 'react'
import {
  api,
  type AttentionItem,
  type Briefing,
  type BriefingBody,
  type BriefingRef,
  type SearchResults,
  type Settings,
  type Status,
  type Today,
} from './api.js'
import { SettingsPanel } from './Settings.js'
import { friendlyError } from './errors.js'
import { contentLang } from './lang.js'
import { driveUrl, mailUrl, obsidianUrl, sourceUrl } from './links.js'
import { dialogOpen, useDialog, useLeaving } from './useDialog.js'
import { wallpaperById } from './wallpapers.js'
import { applyAppearance } from './appearance.js'
import { AURORA_THEME, scaleTheme, themeFromPixels } from './theme.js'
import { WidgetColumns, WidgetsInline, type WidgetData } from './Widgets.js'
import { DEFAULT_WIDGET_LAYOUT, type BriefingStats, type WidgetLayout } from '../shared/widgets.js'

function SourceGlyph({ service }: { service: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg className="od-icon rail__icon" viewBox="0 0 24 24" aria-hidden="true">
      {service === 'vault' && (
        <>
          <path d="M6.5 3.5h8l4 4V20a1.2 1.2 0 0 1-1.2 1.2H6.5A1.2 1.2 0 0 1 5.3 20V4.7a1.2 1.2 0 0 1 1.2-1.2z" {...common} />
          <path d="M14.2 3.6V8h4.1M8.6 12h6.8M8.6 15.5h4.8" {...common} />
        </>
      )}
      {service === 'google' && (
        <>
          <path d="M12 3.4L21 19.4H3L12 3.4z" {...common} />
          <path d="M8.1 12.4h7.8" {...common} />
        </>
      )}
      {service === 'imap' && (
        <>
          <rect x="3" y="5.4" width="18" height="13.2" rx="2.4" {...common} />
          <path d="M4.2 7.1L12 13l7.8-5.9" {...common} />
        </>
      )}
      {service === 'github' && (
        <>
          <circle cx="6.5" cy="6" r="2.6" {...common} />
          <circle cx="6.5" cy="18" r="2.6" {...common} />
          <circle cx="17.5" cy="8" r="2.6" {...common} />
          <path d="M6.5 8.6v6.8M9.1 6h3.4a3 3 0 0 1 3 3" {...common} />
        </>
      )}
      {service === 'browser' && (
        <>
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="M15.6 8.4l-1.9 5.3-5.3 1.9 1.9-5.3 5.3-1.9z" {...common} />
        </>
      )}
      {service === 'calendar' && (
        <>
          <rect x="3.5" y="5.5" width="17" height="15" rx="2" {...common} />
          <path d="M3.5 10h17M8 3.5v4M16 3.5v4" {...common} />
        </>
      )}
      {service === 'settings' && (
        <>
          <circle cx="12" cy="12" r="3" {...common} />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" {...common} strokeWidth={1.3} />
        </>
      )}
    </svg>
  )
}

const SERVICE_LABELS: Record<string, string> = {
  vault: 'vault',
  google: 'drive',
  imap: 'mail',
  github: 'github',
  browser: 'browser',
}

// A station link is named by what it opens, not only by its state.
const OPEN_LABELS: Record<string, string> = {
  vault: 'opens in Obsidian',
  google: 'opens in Google Drive',
  imap: 'opens in Gmail',
  github: 'opens GitHub notifications',
}

// Which pile the page points at first. Reply is the only one with a closing action.
const START_ORDER: AttentionItem['kind'][] = [
  'reply',
  'mail',
  'task',
  'github',
  'inbox',
  'stale-project',
  'calendar',
]

function time(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** An all-day event runs midnight to midnight; printing a clock time would be a lie. */
function eventTime(event: { start: string; end: string }): string {
  const start = Date.parse(event.start)
  if (Number.isNaN(start)) return '—'
  return Date.parse(event.end) - start >= 23 * 3_600_000 ? 'All day' : time(event.start)
}

const TODAY_EVENTS = 6

function startPoint(item: AttentionItem): { num?: number; text: string; meta: string } {
  switch (item.kind) {
    case 'reply':
      return { num: item.count, text: 'awaiting your reply', meta: item.detail }
    case 'mail':
      return { num: item.count, text: 'unread mail', meta: item.detail }
    case 'github':
      return { num: item.count, text: 'GitHub items', meta: item.detail }
    case 'browser':
      return { num: item.count, text: 'browser visits today', meta: item.detail }
    case 'task': {
      if (item.label.startsWith('#') && item.count && item.count > 1) {
        return {
          num: item.count,
          text: `open tasks in ${item.label}`,
          meta: item.detail.replace(/^\d+ open in /, ''),
        }
      }
      return { text: item.label, meta: item.detail }
    }
    default:
      return { text: item.label, meta: item.detail }
  }
}

/** A briefing is either the scheduled morning run or the one the person asked for; the window says how far back it looked. */
function briefingSpan(meta: Briefing['digest_meta']): string | null {
  const from = Date.parse(meta?.since ?? '')
  const to = Date.parse(meta?.until ?? '')
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null
  const hours = Math.round((to - from) / 3_600_000)
  return hours >= 48 ? `${Math.round(hours / 24)} d` : `${hours} h`
}

const KIND_LABELS: Record<string, string> = { weekly: 'Week', evening: 'Evening' }

function kindLabel(kind: string | undefined): string {
  const label = kind ? KIND_LABELS[kind] : undefined
  return label ? ` · ${label}` : ''
}

/** Hours since the briefing was written; an unreadable date reads as fresh, never as "refresh". */
function briefingAgeHours(iso: string, now: number): number {
  const created = Date.parse(iso)
  return Number.isNaN(created) ? 0 : Math.floor((now - created) / 3_600_000)
}

function BriefingBody({ briefing, vaultPath }: { briefing: Briefing; vaultPath: string }) {
  return briefing.body ? (
    <BriefingPoints
      body={briefing.body}
      vaultPath={vaultPath}
      id={briefing.id}
      digest={briefing.digest ?? ''}
    />
  ) : (
    <LegacyBriefingBody markdown={briefing.markdown} />
  )
}

function refTint(kind: BriefingRef['kind']): string {
  switch (kind) {
    case 'note':
      return '--mint'
    case 'mail':
      return '--amber'
    case 'drive':
      return '--ice'
    case 'github':
      return '--ink'
    case 'browser':
      return '--periwinkle'
    default:
      return '--amber'
  }
}

/** Why unfolds under a point: a quiet inset that grows instead of appearing. */
function Why({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false)
  const presence = usePresence(open, 200)
  return (
    <div className={`why${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="why__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Why
        <span className="why__plus" aria-hidden="true">
          +
        </span>
      </button>
      {presence.mounted && (
        <div className={`why-panel${presence.leaving ? ' is-leaving' : ''}`}>
          {lines.map((line, index) => (
            <span
              key={line}
              lang={contentLang(line)}
              style={{ '--i': index } as React.CSSProperties}
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** The panels under the briefing open like the Why inset instead of snapping open. */
function Disclosure({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const presence = usePresence(open, 200)
  return (
    <div className={`disclosure${className ? ` ${className}` : ''}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="disclosure__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="disclosure__chevron" aria-hidden="true">
          ›
        </span>
        <span>{label}</span>
      </button>
      {presence.mounted && (
        <div className={`disclosure__body${presence.leaving ? ' is-leaving' : ''}`}>
          <div className="disclosure__inner">
            {hint && <p className="disclosure__hint">{hint}</p>}
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

/** What the app is, what it reads, and where it keeps everything. */
function AboutDialog({
  status,
  settings,
  stations,
  onClose,
}: {
  status: Status | null
  settings: Settings
  stations: Array<{
    service: string
    total: number
    configured: number
    error: string | null
    lastSync: string | null
  }>
  onClose: () => void
}) {
  const { leaving, close } = useLeaving()
  const dialog = useDialog<HTMLDivElement>(true, () => close(onClose))
  const [copied, setCopied] = useState(false)
  const connected = stations.filter((station) => station.configured > 0).length
  const failing = stations.filter((station) => station.error).length
  const lastSync = stations
    .map((station) => station.lastSync)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  async function copyDiagnostics(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify({ status, settings }, null, 2))
    setCopied(true)
  }

  return (
    <div className={`modal-backdrop${leaving ? ' leaving' : ''}`} onClick={() => close(onClose)}>
      <div
        ref={dialog}
        className="modal card modal--about"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="about-title">
          Local Dashboard <span className="about__version">v{status?.version ?? '—'}</span>
        </h2>
        <p className="about__privacy">
          Everything stays on this machine. Only the briefing digest is sent to DeepSeek.
        </p>
        <dl className="about__facts">
          <div>
            <dt>Data</dt>
            <dd>
              <span className="detail" lang={contentLang(settings.dataDir)}>
                {settings.dataDir}
              </span>
              {window.dashboard && (
                <button
                  type="button"
                  className="about__inline"
                  onClick={() => window.dashboard?.openDataFolder()}
                >
                  Open folder
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>
              {connected} of {stations.length} connected
              {failing > 0 ? ` · ${failing} need${failing === 1 ? 's' : ''} attention` : ''}
              {lastSync ? ` · last sync ${time(lastSync)}` : ''}
            </dd>
          </div>
          <div>
            <dt>DeepSeek</dt>
            <dd>{settings.hasDeepSeekKey ? 'API key saved' : 'No API key yet'}</dd>
          </div>
        </dl>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={() => void copyDiagnostics()}>
            {copied ? 'Copied' : 'Copy diagnostics'}
          </button>
          <a
            className="btn btn--ghost"
            href="https://github.com/bibitupa-b/Local-Dashboard#readme"
            target="_blank"
            rel="noreferrer"
          >
            README
          </a>
          <button type="button" className="btn btn--primary" onClick={() => close(onClose)}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/** Structured answer: a headline to read first, points that open their source, one suggestion. */
function BriefingPoints({
  body,
  vaultPath,
  id,
  digest,
}: {
  body: BriefingBody
  vaultPath: string
  id: number
  digest: string
}) {
  const [votes, setVotes] = useState<Record<number, 'useful' | 'miss'>>({})

  function votePoint(index: number, value: 'useful' | 'miss'): void {
    const next = votes[index] === value ? null : value
    setVotes((current) => {
      const copy = { ...current }
      if (next === null) delete copy[index]
      else copy[index] = next
      return copy
    })
    void api.bulletFeedback(id, index, next).catch(() => {})
  }

  return (
    <div
      className="markdown"
      lang={contentLang(`${body.headline} ${body.bullets.map((b) => b.text).join(' ')}`)}
    >
      {body.headline && (
        <h3 className="briefing__headline headline" dir="auto" style={{ '--i': 0 } as React.CSSProperties}>
          {body.headline}
        </h3>
      )}
      <ul className="briefing__reading">
        {body.bullets.map((bullet, index) => {
          const refs = refLinks(bullet.refs, vaultPath)
          const why = whyLines(
            refs.map(({ ref }) => ref),
            digest,
          )
          return (
            <li
              key={`${index}-${bullet.text.slice(0, 24)}`}
              className="line point"
              dir="auto"
              style={{ '--i': index + 1 } as React.CSSProperties}
            >
              <p>{bullet.text}</p>
              <div className="point__vote" role="group" aria-label={`Was point ${index + 1} useful?`}>
                <button
                  type="button"
                  className="btn btn--ghost btn--mini"
                  aria-label={`Mark point ${index + 1} useful`}
                  aria-pressed={votes[index] === 'useful'}
                  onClick={() => votePoint(index, 'useful')}
                >
                  Useful
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--mini"
                  aria-label={`Mark point ${index + 1} miss`}
                  aria-pressed={votes[index] === 'miss'}
                  onClick={() => votePoint(index, 'miss')}
                >
                  Miss
                </button>
              </div>
              {(refs.length > 0 || why.length > 0) && (
                <div className="point__sources">
                  <span className="refs">
                    {refs.map(({ ref, href }, at) =>
                      href ? (
                        <a
                          key={at}
                          className="chip ref"
                          href={href}
                          lang={contentLang(ref.label)}
                          target={href.startsWith('obsidian://') ? undefined : '_blank'}
                          rel={href.startsWith('obsidian://') ? undefined : 'noreferrer'}
                        >
                          <span
                            className="status-dot"
                            style={{ '--dot': `var(${refTint(ref.kind)})` } as React.CSSProperties}
                            aria-hidden="true"
                          />
                          {ref.label}
                        </a>
                      ) : (
                        <span key={at} className="chip chip--dead ref text" lang={contentLang(ref.label)}>
                          <span
                            className="status-dot"
                            style={{ '--dot': `var(${refTint(ref.kind)})` } as React.CSSProperties}
                            aria-hidden="true"
                          />
                          {ref.label}
                        </span>
                      ),
                    )}
                  </span>
                  {why.length > 0 && <Why lines={why} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {body.suggestion && (
        <div
          className="suggestion line"
          dir="auto"
          style={{ '--i': body.bullets.length + 1 } as React.CSSProperties}
        >
          <span className="label label--amber" lang="en">
            Suggestion
          </span>
          <p>{body.suggestion}</p>
        </div>
      )}
    </div>
  )
}

function refHref(ref: BriefingRef, vaultPath: string): string | null {
  switch (ref.kind) {
    case 'note':
      return obsidianUrl(vaultPath, ref.path)
    case 'mail':
      return mailUrl(ref.messageId, ref.label)
    case 'drive':
      return driveUrl(ref.fileId)
    case 'github':
      return ref.url
    default:
      return null
  }
}

const REFS_PER_BULLET = 3

/** Two digest lines can name the same source; a point shows it once, and links no more than a line can hold. */
function refLinks(
  refs: BriefingRef[],
  vaultPath: string,
): Array<{ ref: BriefingRef; href: string | null }> {
  const seen = new Set<string>()
  const links: Array<{ ref: BriefingRef; href: string | null }> = []
  for (const ref of refs) {
    const href = refHref(ref, vaultPath)
    const key = `${ref.label}\u0000${href ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ ref, href })
    if (links.length === REFS_PER_BULLET) break
  }
  return links
}

const WHY_LINES = 3

/** The digest lines behind a point: a ref label starts its line, so a substring finds it. */
function whyLines(refs: BriefingRef[], digest: string): string[] {
  if (!digest) return []
  const lines = digest.split('\n')
  const found: string[] = []
  for (const ref of refs) {
    const line = lines.find((text) => text.includes(ref.label))
    if (!line || found.includes(line)) continue
    found.push(line)
    if (found.length === WHY_LINES) break
  }
  return found
}

// A bullet and a plain line are the same entry; the marker is punctuation, not content.
function LegacyBriefingBody({ markdown }: { markdown: string }) {
  const entries = markdown
    .split('\n')
    .map((line) => line.trim().replace(/^[-*•]\s+/, ''))
    .filter(Boolean)

  if (entries.length === 0) {
    return (
      <p className="markdown empty">
        This briefing came back empty. Generate another one.
      </p>
    )
  }

  return (
    <div className="markdown" lang={contentLang(markdown)}>
      <ul className="briefing__reading">
        {entries.map((text, index) => {
          // The closing entry is the suggestion — but a one-line briefing has no closing entry.
          const suggestion = index === entries.length - 1 && entries.length > 1
          const body = suggestion
            ? text.replace(/^(suggestion|предложение|рекомендация)\s*[:—-]\s*/i, '')
            : text
          return (
            <li key={`${index}-${text.slice(0, 24)}`} className="line point" dir="auto">
              <p>{body}</p>
              {suggestion && (
                <span className="label label--amber" lang="en">
                  Suggestion
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Light pointer parallax for the room: wallpaper and aurora move against the pointer by a few pixels. */
function useParallax(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!enabled || !node || typeof window.matchMedia !== 'function') return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let frame = 0
    let x = 0
    let y = 0
    const paint = () => {
      frame = 0
      node.style.setProperty('--par-x', `${x.toFixed(1)}px`)
      node.style.setProperty('--par-y', `${y.toFixed(1)}px`)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      x = (0.5 - event.clientX / window.innerWidth) * 20
      y = (0.5 - event.clientY / window.innerHeight) * 14
      if (!frame) frame = requestAnimationFrame(paint)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [enabled])
  return ref
}

/** Keeps a floating layer mounted for one exit animation; instant when motion is reduced. */
function usePresence(open: boolean, exit = 110) {
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (open) {
      setMounted(true)
      setLeaving(false)
      return undefined
    }
    if (!mounted) return undefined
    if (
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setMounted(false)
      return undefined
    }
    setLeaving(true)
    const timer = setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, exit)
    return () => clearTimeout(timer)
  }, [open, mounted, exit])
  return { mounted, leaving }
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [attention, setAttention] = useState<AttentionItem[] | null>(null)
  const [briefings, setBriefings] = useState<Briefing[] | null>(null)
  const [today, setToday] = useState<Today | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [stats, setStats] = useState<BriefingStats | null>(null)
  const [wide, setWide] = useState(() => window.innerWidth >= 1920)
  const [busy, setBusy] = useState(false)
  const [voting, setVoting] = useState(false)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<{ id: number; text: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  // The POST stays open for the whole sync, so this is the only local proof it started.
  const [syncPending, setSyncPending] = useState(false)
  const [note, setNote] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
    retry?: boolean
  } | null>(null)
  const [glow, setGlow] = useState(false)
  const [about, setAbout] = useState(false)
  const [groundingOpen, setGroundingOpen] = useState(false)
  const [groundingSeen, setGroundingSeen] = useState(() => {
    try {
      return localStorage.getItem('dashboard.groundingSeen') === '1'
    } catch {
      return false
    }
  })
  const [theme, setTheme] = useState(AURORA_THEME)
  const [showSettings, setShowSettings] = useState(false)
  const [welcome, setWelcome] = useState(() => {
    try {
      return !localStorage.getItem('dashboard.welcomed')
    } catch {
      return false
    }
  })
  const [syncOutcome, setSyncOutcome] = useState<'ok' | 'error' | null>(null)
  const wasRunning = useRef(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [resultsQuery, setResultsQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResults | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const generating = useRef(false)
  const wasSettings = useRef(showSettings)
  const searched = useRef('')
  const searchSeq = useRef(0)
  const [live, setLive] = useState('')

  async function load() {
    const [statusRes, attentionRes, briefingsRes, settingsRes, todayRes, statsRes] =
      await Promise.allSettled([
        api.status(),
        api.attention(),
        api.briefings(),
        api.settings(),
        api.today(),
        api.briefingStats(),
      ] as const)
    const missing: string[] = []
    if (statusRes.status === 'fulfilled') setStatus(statusRes.value)
    else missing.push('service status')
    if (attentionRes.status === 'fulfilled') setAttention(attentionRes.value)
    else missing.push("today's start")
    if (briefingsRes.status === 'fulfilled') setBriefings(briefingsRes.value.items)
    else missing.push('the briefing')
    if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value)
    else missing.push('settings')
    if (todayRes.status === 'fulfilled') setToday(todayRes.value)
    else missing.push("today's calendar")
    if (statsRes.status === 'fulfilled') setStats(statsRes.value)

    // One failed endpoint must not blank the page; the rest still renders.
    const results = [statusRes, attentionRes, briefingsRes, settingsRes, todayRes]
    const failed = results.find((result) => result.status === 'rejected')
    if (results.some((result) => result.status === 'fulfilled')) setLoaded(true)
    if (!failed) {
      setNote((current) => (current?.retry ? null : current))
      return
    }
    setNote({
      text: `${friendlyError(
        failed.reason instanceof Error ? failed.reason.message : String(failed.reason),
      )} (${missing.join(', ')})`,
      tone: 'error',
      retry: true,
    })
  }

  useEffect(() => {
    const drive = new URLSearchParams(window.location.search).get('drive')
    if (drive === 'connected') {
      setNote({ text: 'Google connected. Sources are syncing now.', tone: 'success' })
    } else if (drive === 'error') {
      setNote({
        text: 'Google authorization failed. Try connecting again from Settings.',
        tone: 'error',
      })
    }
  }, [])

  const running = syncPending || (status?.sync.running ?? false)

  // A minute is enough at rest; 3 seconds of status is only worth paying for while a sync runs,
  // and nothing is worth paying for while the window is hidden.
  // shortcut: a sync started outside this window (tray, startup catch-up) turns the fast poll on at
  // the next minute's load, upgrade if the rail must move within a second of a tray-triggered sync.
  useEffect(() => {
    void load()
    const loadTimer = setInterval(() => {
      if (!document.hidden) void load()
    }, 60_000)
    const statusTimer = running
      ? setInterval(() => {
          if (!document.hidden) void api.status().then(setStatus).catch(() => {})
        }, 3000)
      : undefined
    // Coming back to a window that was hidden for a while must not show stale times.
    const onVisible = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(loadTimer)
      if (statusTimer) clearInterval(statusTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running])

  useEffect(() => {
    const term = query.trim()
    searched.current = term
    if (term.length < 2) {
      setSuggestions(null)
      return
    }
    const handle = setTimeout(() => {
      api
        .search(term)
        .then((found) => {
          // A slower earlier query must not overwrite the newer one.
          if (searched.current !== term) return
          setSuggestions(found)
          setActiveSuggestion(0)
        })
        .catch(() => {
          if (searched.current === term) setSuggestions(null)
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    if (!suggestions) return undefined
    // Clicking anywhere else must dismiss the popup; a mouse user should not have to know Escape.
    const wrap = document.querySelector('.search-wrap')
    const dismiss = (event: PointerEvent) => {
      if (!wrap?.contains(event.target as Node)) setSuggestions(null)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [suggestions])

  // The results sheet is a layer too: clicking away closes it, like the menu above.
  useEffect(() => {
    if (!results || !resultsQuery) return undefined
    const dismiss = (event: PointerEvent) => {
      const panel = document.querySelector('.search-overlay__panel')
      if (panel?.contains(event.target as Node)) return
      setResults(null)
      setResultsQuery('')
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [results, resultsQuery])

  useEffect(() => {
    const update = () => document.body.classList.toggle('motion-paused', document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  // The gutters appear only when the window can keep the 1180px measure plus two columns.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(min-width: 1920px)')
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // A success message is a receipt, not a state: it should not sit on the page forever.
  useEffect(() => {
    if (!note || note.tone === 'error') return
    const timer = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(timer)
  }, [note])

  useEffect(() => {
    if (!glow) return
    const timer = setTimeout(() => setGlow(false), 900)
    return () => clearTimeout(timer)
  }, [glow])

  useEffect(() => {
    if (!status) return
    if (wasRunning.current && !status.sync.running) {
      const failed = status.sources.some((source) => source.lastError)
      setSyncOutcome(failed ? 'error' : 'ok')
      setLive(
        failed
          ? `Sync failed at ${time(new Date().toISOString())}, a source reported an error.`
          : `Sync finished at ${time(new Date().toISOString())}.`,
      )
      const timer = setTimeout(() => setSyncOutcome(null), 1600)
      wasRunning.current = false
      return () => clearTimeout(timer)
    }
    wasRunning.current = status.sync.running
    return undefined
  }, [status])

  useEffect(() => {
    if (showSettings) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (dialogOpen()) return
      const target = event.target as HTMLElement | null
      const typing =
        !!target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      if (event.key === '/' && !typing) {
        event.preventDefault()
        searchRef.current?.focus()
      } else if (event.key === 'Escape' && !typing) {
        setSuggestions(null)
        setResults(null)
        setResultsQuery('')
      } else if (
        (event.key === 'b' || event.key === 'B') &&
        !typing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        void generate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSettings])

  // The route swap replaces the whole page; focus must land on the new route, not on <body>.
  useEffect(() => {
    if (wasSettings.current === showSettings) return
    wasSettings.current = showSettings
    if (showSettings) document.querySelector<HTMLElement>('.settings-head button')?.focus()
    else document.querySelector<HTMLElement>('.rail__btn--settings')?.focus()
  }, [showSettings])

  function withViewTransition(update: () => void): void {
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => unknown
    }
    if (
      doc.startViewTransition &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      doc.startViewTransition(update)
      return
    }
    update()
  }

  function toggleSettings(): void {
    const stage = document.getElementById('stage')
    if (stage) stage.scrollTop = 0
    withViewTransition(() => setShowSettings((value) => !value))
  }

  function dismissGrounding(): void {
    setGroundingSeen(true)
    setGroundingOpen(false)
    try {
      localStorage.setItem('dashboard.groundingSeen', '1')
    } catch {
      // private mode: the note returns next launch, which is harmless
    }
  }

  function disableGrounding(): void {
    setSettings((current) => (current ? { ...current, groundingStrict: false } : current))
    void api.saveSettings({ groundingStrict: false }).catch(() => {})
    dismissGrounding()
  }

  function closeSettings(): void {
    const stage = document.getElementById('stage')
    if (stage) stage.scrollTop = 0
    withViewTransition(() => setShowSettings(false))
  }

  function dismissWelcome(): void {
    try {
      localStorage.setItem('dashboard.welcomed', '1')
    } catch {
      // private mode: the welcome returns next launch, which is harmless
    }
    setWelcome(false)
  }

  async function vote(id: number, value: 'useful' | 'miss') {
    setVoting(true)
    try {
      await api.feedback(id, value)
      setBriefings((items) =>
        (items ?? []).map((item) => (item.id === id ? { ...item, feedback: value } : item)),
      )
      setLive(value === 'useful' ? 'Marked useful.' : 'Marked as missing the point.')
    } catch (error) {
      setNote({
        text: `Feedback failed: ${friendlyError(
          error instanceof Error ? error.message : String(error),
        )}`,
        tone: 'error',
      })
    } finally {
      setVoting(false)
    }
  }

  async function askAbout(event: React.FormEvent, id: number) {
    event.preventDefault()
    const value = question.trim()
    if (!value || asking) return
    setAsking(true)
    try {
      setAnswer({ id, text: await api.ask(id, value) })
    } catch (error) {
      setNote({
        text: `No answer: ${friendlyError(
          error instanceof Error ? error.message : String(error),
        )}`,
        tone: 'error',
      })
    } finally {
      setAsking(false)
    }
  }

  async function generate() {
    // One paid call at a time: a held key repeats and must not spend twice.
    if (generating.current) return
    generating.current = true
    setBusy(true)
    setNote(null)
    setLive('Writing the briefing…')
    try {
      const result = await api.generate()
      if ('error' in result) {
        setNote({
          text:
            result.error === 'no-key'
              ? 'Add a DeepSeek key in Settings -> Connections.'
              : `Briefing failed: ${friendlyError(result.error)}`,
          tone: 'error',
        })
      } else {
        setBriefings((items) => [
          {
            id: result.id,
            created_at: new Date().toISOString(),
            trigger: 'manual',
            markdown: result.markdown,
            body: result.body,
            digest: result.digest,
            digest_meta: result.digestMeta,
            feedback: null,
            opens: 0,
          },
          ...(items ?? []),
        ])
        setStatus((current) =>
          current ? { ...current, briefingToday: true, briefingError: null } : current,
        )
        setGlow(true)
        setLive(`Briefing ready at ${time(new Date().toISOString())}.`)
        if ((result.digestMeta as { model?: string }).model === 'rules') {
          setNote({
            text: 'Rules briefing — add a DeepSeek key for an AI briefing.',
            tone: 'info',
          })
        }
      }
    } catch (error) {
      setNote({
        text: `Briefing failed: ${friendlyError(
          error instanceof Error ? error.message : String(error),
        )}`,
        tone: 'error',
      })
    } finally {
      generating.current = false
      setBusy(false)
    }
  }

  async function search() {
    const term = query.trim()
    const seq = ++searchSeq.current
    if (term.length < 2) {
      setResults(null)
      setResultsQuery('')
      setNote({ text: 'Type at least 2 characters to search.', tone: 'info' })
      return
    }
    setSuggestions(null)
    try {
      const found = await api.search(term)
      if (seq !== searchSeq.current) return
      setResults(found)
      setResultsQuery(term)
      setSuggestions(null)
      const count = found.notes.length + found.mail.length + found.drive.length
      setLive(
        count === 0
          ? `Nothing found for ${term}.`
          : count === 1
            ? `One result for ${term}.`
            : `${count} results for ${term}.`,
      )
    } catch (error) {
      if (seq !== searchSeq.current) return
      setNote({
        text: friendlyError(error instanceof Error ? error.message : String(error)),
        tone: 'error',
      })
    }
  }

  type Suggestion = { kind: 'note' | 'mail' | 'drive'; label: string; detail?: string; url: string }

  const vaultPath = settings?.vaultPath ?? ''
  const suggestionOpen =
    query.trim().length >= 2 && suggestions !== null && !(results && resultsQuery)
  const suggestionPresence = usePresence(suggestionOpen)
  const overlayPresence = usePresence(Boolean(results && resultsQuery))
  // A layer that is leaving keeps showing what it showed; only its pointer is gone.
  const lastSuggestions = useRef<SearchResults | null>(null)
  const lastOverlay = useRef<{ results: SearchResults; query: string } | null>(null)
  if (suggestions) lastSuggestions.current = suggestions
  if (results && resultsQuery) lastOverlay.current = { results, query: resultsQuery }
  const shownSuggestions =
    suggestions ?? (suggestionPresence.leaving ? lastSuggestions.current : null)
  const overlay =
    results && resultsQuery
      ? { results, query: resultsQuery }
      : overlayPresence.leaving
        ? lastOverlay.current
        : null

  const items: Suggestion[] = shownSuggestions
    ? [
        ...shownSuggestions.notes.map((note) => ({
          kind: 'note' as const,
          label: note.path,
          url: obsidianUrl(vaultPath, note.path),
        })),
        ...shownSuggestions.mail.map((message) => ({
          kind: 'mail' as const,
          label: message.subject,
          detail: message.sender,
          url: mailUrl(message.messageId, message.subject),
        })),
        ...shownSuggestions.drive.map((file) => ({
          kind: 'drive' as const,
          label: file.name,
          url: driveUrl(file.id),
        })),
      ]
    : []

  function open(url: string) {
    if (url.startsWith('obsidian://')) window.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  function attentionHref(item: AttentionItem): string | null {
    if (item.path) return obsidianUrl(vaultPath, item.path)
    if (item.messageId) return mailUrl(item.messageId, item.label)
    if (item.fileId) return driveUrl(item.fileId)
    return item.url ?? null
  }

  const widgetLayout = settings?.widgets?.length ? settings.widgets : DEFAULT_WIDGET_LAYOUT

  function saveWidgets(next: WidgetLayout[]): void {
    setSettings((current) => (current ? { ...current, widgets: next } : current))
    void api.saveSettings({ widgets: next }).catch((error: unknown) =>
      setNote({
        text: friendlyError(error instanceof Error ? error.message : String(error)),
        tone: 'error',
      }),
    )
  }

  const widgetData: WidgetData = { today, attention, stats, hrefFor: attentionHref }

  function choose(item?: Suggestion) {
    const target = item ?? items[activeSuggestion]
    if (!target) return
    setSuggestions(null)
    open(target.url)
  }

  // The search-all row is one more option after the suggestions, so arrows reach it too.
  const activeOption = Math.min(activeSuggestion, items.length)
  const optionCount = items.length + 1

  function onSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void search()
      return
    }
    if (event.key === 'Escape') {
      setSuggestions(null)
      return
    }
    if (!suggestionOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestion((activeOption + 1) % optionCount)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestion((activeOption - 1 + optionCount) % optionCount)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeOption === items.length) void search()
      else choose(items[activeOption])
    }
  }

  const latest = briefings?.[0]
  const openedBriefing = useRef<number | null>(null)
  useEffect(() => {
    if (!latest || busy || openedBriefing.current === latest.id) return
    openedBriefing.current = latest.id
    void api.opened(latest.id).catch(() => {})
  }, [latest?.id, busy])
  const groundingChecked = latest?.digest_meta?.grounding?.verified === true
  const groundingPresence = usePresence(groundingOpen, 200)

  useEffect(() => {
    if (!groundingChecked || groundingSeen) return
    setGroundingOpen(true)
  }, [groundingChecked, groundingSeen])
  // Stale is a fact about today's briefing only; an old one from yesterday is not "today's".
  const ageHours =
    latest && status?.briefingToday ? briefingAgeHours(latest.created_at, Date.now()) : 0
  // The settings route unmounts the briefing; hover owns the reading rule now.
  const welcomeDialog = useLeaving()
  const welcomeRef = useDialog<HTMLDivElement>(welcome && Boolean(settings), () =>
    welcomeDialog.close(dismissWelcome),
  )

  const stations = (() => {
    const order = ['vault', 'google', 'imap', 'github', 'browser']
    const map = new Map<
      string,
      { service: string; total: number; configured: number; error: string | null; lastSync: string | null }
    >()
    for (const source of status?.sources ?? []) {
      const group =
        map.get(source.service) ??
        { service: source.service, total: 0, configured: 0, error: null, lastSync: null }
      group.total++
      if (source.configured) group.configured++
      if (source.lastError) group.error = source.lastError
      if (source.lastSync && (!group.lastSync || source.lastSync > group.lastSync)) {
        group.lastSync = source.lastSync
      }
      map.set(source.service, group)
    }
    return [...map.values()].sort((a, b) => order.indexOf(a.service) - order.indexOf(b.service))
  })()

  const activeService = status?.sources.find((source) => source.id === status.sync.source)?.service
  // The rail's accessible name is the station a person reads, never the raw connection id.
  const syncing = activeService ? (SERVICE_LABELS[activeService] ?? activeService) : null
  const progress = !status
    ? 0
    : syncOutcome
      ? 100
      : Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((status.sync.sourceIndex + status.sync.done / Math.max(status.sync.total, 1)) /
                Math.max(status.sync.sourceTotal, 1)) *
                100,
            ),
          ),
        )
  // At rest the rail is a track; only a running sync (or its outcome) fills it.
  const fill = running || syncOutcome ? progress : 0

  const setupSteps = [
    {
      label: 'Connect a vault',
      done: status?.sources.some((source) => source.kind === 'vault' && source.configured) ?? false,
    },
    { label: 'Add a DeepSeek key', done: settings?.hasDeepSeekKey ?? false },
    { label: 'Generate the first briefing', done: (briefings?.length ?? 0) > 0 },
  ]
  const setupDone = setupSteps.every((step) => step.done)

  const first = START_ORDER.map((kind) => attention?.find((item) => item.kind === kind)).find(
    (item): item is AttentionItem => Boolean(item),
  )
  const start = first ? { ...startPoint(first), href: attentionHref(first) } : null

  const date = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const wall = wallpaperById(settings?.wallpaper)
  const glassScale = (settings?.appearance.glass ?? 100) / 100
  const accentHue = settings?.appearance.accent ?? null

  // The wallpaper decides the palette; sampling 32x20 is enough and costs nothing at runtime.
  useEffect(() => {
    if (!wall.full) {
      setTheme(scaleTheme(AURORA_THEME, glassScale))
      return undefined
    }
    let cancelled = false
    const image = new Image()
    const sample = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 20
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      setTheme(
        themeFromPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, {
          glassScale,
          accentHue,
        }),
      )
    }
    image.src = wall.full
    if (typeof image.decode === 'function') image.decode().then(sample).catch(() => {})
    else image.onload = sample
    return () => {
      cancelled = true
    }
  }, [wall.full, glassScale, accentHue])

  useEffect(() => {
    const root = document.documentElement
    for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value)
  }, [theme])

  // The five appearance knobs are plain variables; every glass rule reads them.
  useEffect(() => {
    if (settings?.appearance) applyAppearance(settings.appearance)
  }, [settings?.appearance])
  const lastSync = stations
    .map((station) => station.lastSync)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  const anyError = stations.some((station) => station.error)
  const railState = (station: (typeof stations)[number]): 'ok' | 'error' | 'hollow' =>
    station.error ? 'error' : station.configured > 0 ? 'ok' : 'hollow'

  function doSync(): void {
    setSyncPending(true)
    void api
      .sync()
      .then(load)
      .catch((error: unknown) =>
        setNote({
          text: friendlyError(error instanceof Error ? error.message : String(error)),
          tone: 'error',
        }),
      )
      .finally(() => setSyncPending(false))
  }

  function clearSearch(): void {
    searchSeq.current++
    setQuery('')
    setResults(null)
    setResultsQuery('')
    setSuggestions(null)
  }

  const roomRef = useParallax(settings?.appearance.motion !== 'calm')
  const environment = (
    <div
      ref={roomRef}
      className={`environment${wall.full ? ' environment--photo' : ''}`}
      aria-hidden="true"
    >
      {wall.full && (
        <div
          key={wall.id}
          className="environment__photo"
          style={
            {
              backgroundImage: `url(${wall.full})`,
              backgroundPosition: wall.focus ?? 'center',
              transformOrigin: wall.focus ?? 'center',
              '--wall-zoom': String(wall.zoom ?? 1),
            } as React.CSSProperties
          }
        />
      )}
      <div className="environment__aurora">
        <span className="orb orb--indigo" />
        <span className="orb orb--teal" />
        <span className="orb orb--amber" />
        <span className="conic-band" />
      </div>
      <div className="environment__grain" />
    </div>
  )

  const rail = (
    <nav className="rail glass" aria-label="Sources and settings">
      <div className="rail__group">
        {stations.map((station) => {
          const name = SERVICE_LABELS[station.service] ?? station.service
          const url = sourceUrl(station.service, vaultPath)
          const detail = station.error
            ? friendlyError(station.error)
            : station.lastSync
              ? `Last synced ${time(station.lastSync)}`
              : station.configured > 0
                ? 'Waiting for the first sync'
                : 'Not connected'
          const label = `${name}, ${
            station.total > 1 ? `${station.total} accounts, ` : ''
          }${detail}${url ? `, ${OPEN_LABELS[station.service] ?? 'opens the service'}` : ''}`
          const active = running && activeService === station.service
          const state = station.error
            ? 'error'
            : station.lastSync
              ? time(station.lastSync)
              : station.configured > 0
                ? 'waiting'
                : 'off'
          const body = (
            <>
              <SourceGlyph service={station.service} />
              <span className="rail__caption" aria-hidden="true">
                <span className="rail__name">{name}</span>
                <span className="rail__state">
                  <span className={`status-dot status-dot--${railState(station)}`} />
                  {state}
                </span>
              </span>
              <span className="sr-only">{name}</span>
              <span className="sr-only">{detail}</span>
            </>
          )
          return url ? (
            <a
              key={station.service}
              className={`rail__btn station ${station.service} rail__btn--${station.service}${active ? ' is-syncing' : ''}`}
              href={url}
              aria-label={label}
              title={detail}
              data-tip={name}
              data-tip-sub={detail}
              target={url.startsWith('obsidian://') ? undefined : '_blank'}
              rel={url.startsWith('obsidian://') ? undefined : 'noreferrer'}
            >
              {body}
            </a>
          ) : (
            <button
              key={station.service}
              type="button"
              className={`rail__btn station ${station.service} rail__btn--${station.service}${active ? ' is-syncing' : ''}`}
              onClick={toggleSettings}
              aria-label={label}
              title={detail}
              data-tip={name}
              data-tip-sub={detail}
            >
              {body}
            </button>
          )
        })}
      </div>
      {stations.length > 0 && (
        <span
          className="rail__progress"
          role={running ? 'progressbar' : undefined}
          aria-label={running ? `Syncing ${syncing ?? 'sources'}` : undefined}
          aria-valuemin={running ? 0 : undefined}
          aria-valuemax={running ? 100 : undefined}
          aria-valuenow={running ? progress : undefined}
          aria-hidden={running ? undefined : true}
        >
          <i style={{ width: `${fill}%` }} />
        </span>
      )}
      <div className="rail__spacer" />
      <button
        type="button"
        className={`rail__btn rail__btn--settings${showSettings ? ' is-active' : ''}`}
        onClick={toggleSettings}
        aria-label="Settings"
        title="Settings — Connections, Application, Preferences"
        data-tip="Settings"
        data-tip-sub="Connections, Application, Preferences"
      >
        <SourceGlyph service="settings" />
        <span className="rail__caption">
          <span className="rail__name">settings</span>
        </span>
      </button>
    </nav>
  )

  function topbar(isSettings: boolean) {
    const failed = stations.some((station) => station.error)
    const errorCount = stations.filter((station) => station.error).length
    // The chip carries the whole sync state, so the second line names the count, not only the colour.
    const syncSub = running
      ? status
        ? `${syncing ?? 'sources'} · ${Math.min(
            status.sync.sourceIndex + 1,
            status.sync.sourceTotal,
          )} of ${status.sync.sourceTotal}`
        : 'Starting…'
      : errorCount > 0
        ? `${errorCount} ${errorCount === 1 ? 'source needs' : 'sources need'} attention`
        : stations.length > 0
          ? `${stations.length} ${stations.length === 1 ? 'source' : 'sources'} up to date`
          : 'No sources connected'
    const brand = (
      <button
        type="button"
        className="brand"
        onClick={() => setAbout(true)}
        aria-label="About Local Dashboard"
      >
        <img className="brand__mark" src="/icon-transparent-96.png" alt="" />
        <span className="brand__text">
          <span className="brand__name">Local Dashboard</span>
          <span className="brand__date">{date}</span>
        </span>
      </button>
    )
    return (
      <header className="topbar">
        <div className="topbar__left">{brand}</div>

        <div className="topbar__center">
          {!isSettings && (
            <form
              className="command search-wrap"
              onSubmit={(event) => {
                event.preventDefault()
                void search()
              }}
              role="search"
            >
              <svg
                className="od-icon command__icon"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
                <path
                  d="M16 16l4.2 4.2"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setActiveSuggestion(0)
                  setQuery(event.target.value)
                }}
                onKeyDown={onSearchKey}
                onBlur={() => setSuggestions(null)}
                placeholder="Search notes, mail and Drive…"
                autoComplete="off"
                role="combobox"
                aria-label="Search notes, mail and Drive"
                aria-controls={suggestionOpen ? 'search-suggestions' : undefined}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-expanded={suggestionOpen}
                aria-activedescendant={
                  suggestionOpen ? `search-option-${activeOption}` : undefined
                }
              />
              <kbd className="command__key" aria-hidden="true">
                /
              </kbd>
              <button type="submit" className="sr-only" tabIndex={-1}>
                Search
              </button>
              {suggestionPresence.mounted && (
                <div
                  className={`suggest${suggestionPresence.leaving ? ' is-leaving' : ''}`}
                  id="search-suggestions"
                  role="listbox"
                >
                  {items.map((item, index) => (
                    <Fragment key={`${item.kind}-${index}`}>
                      {(index === 0 || items[index - 1]!.kind !== item.kind) && (
                        <div className="group" aria-hidden="true">
                          {item.kind === 'note' ? 'Notes' : item.kind === 'mail' ? 'Mail' : 'Drive'}
                        </div>
                      )}
                      <div
                        role="option"
                        id={`search-option-${index}`}
                        aria-selected={activeOption === index}
                        className={`item${activeOption === index ? ' active' : ''}`}
                        onMouseEnter={() => setActiveSuggestion(index)}
                        onMouseDown={(event) => {
                          event.preventDefault()
                          choose(item)
                        }}
                      >
                        <span className={`dot ${item.kind === 'note' ? 'vault' : item.kind}`} />
                        <span className="sr-only">
                          {item.kind === 'note'
                            ? 'Note'
                            : item.kind === 'mail'
                              ? 'Mail'
                              : 'Drive'}
                          :{' '}
                        </span>
                        <span className="label" lang={contentLang(item.label)}>
                          {item.label}
                        </span>
                        {item.detail && (
                          <span className="detail" lang={contentLang(item.detail)}>
                            {item.detail}
                          </span>
                        )}
                      </div>
                    </Fragment>
                  ))}
                  <div className="search-foot">
                    <div
                      role="option"
                      id={`search-option-${items.length}`}
                      aria-selected={activeOption === items.length}
                      className={`search-all${activeOption === items.length ? ' active' : ''}`}
                      onMouseEnter={() => setActiveSuggestion(items.length)}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        void search()
                      }}
                    >
                      <span>Search all for “{query.trim()}”</span>
                      <kbd className="command__key" aria-hidden="true">
                        Ctrl ↵
                      </kbd>
                    </div>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        <div className="topbar__right">
          <button
            type="button"
            className={`sync${running ? ' is-running' : ''}${failed ? ' is-failed' : ''}`}
            disabled={running}
            onClick={doSync}
            title={running ? `Syncing ${syncing ?? 'sources'}` : failed ? 'Sync failed. Sync now.' : 'Sync now'}
            aria-label={
              running
                ? `Syncing ${syncing ?? 'sources'}`
                : failed
                  ? 'Sync failed. Sync now.'
                  : lastSync
                    ? `Sync now. Last synced ${time(lastSync)}`
                    : 'Sync now'
            }
          >
            <svg className="od-icon sync__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 16H3v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sync__dot" aria-hidden="true" />
            <span className="sync__text">
              <span className="sync__line">
                {running ? 'Syncing…' : failed ? 'Sync failed' : lastSync ? `Synced ${time(lastSync)}` : 'Sync now'}
              </span>
              <span className="sync__sub">{syncSub}</span>
            </span>
            <span className="sync__bar" aria-hidden="true">
              <i style={{ width: `${running || syncOutcome ? fill : 100}%` }} />
            </span>
          </button>
          {window.dashboard && (
            <div className="window-controls" role="group" aria-label="Window controls">
              <button
                type="button"
                className="wincontrol"
                aria-label="Minimize"
                onClick={() => window.dashboard?.minimize()}
              >
                <svg className="od-icon" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                className="wincontrol"
                aria-label="Maximize"
                onClick={() => window.dashboard?.toggleMaximize()}
              >
                <svg className="od-icon" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <rect
                    x="2.6"
                    y="2.6"
                    width="6.8"
                    height="6.8"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="wincontrol wincontrol--close"
                aria-label="Close"
                onClick={() => window.dashboard?.close()}
              >
                <svg className="od-icon" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path
                    d="M2.8 2.8l6.4 6.4M9.2 2.8L2.8 9.2"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>
    )
  }

  if (showSettings && settings) {
    return (
      <div className="app app-enter">
        {environment}
        {topbar(true)}
        {about && (
          <AboutDialog
            status={status}
            settings={settings}
            stations={stations}
            onClose={() => setAbout(false)}
          />
        )}
        {rail}
        <main className="stage" id="stage" tabIndex={-1} aria-label="Main content">
          <div className="route" role="region" aria-label="Settings">
            <SettingsPanel
              settings={settings}
              hues={theme.hues}
              onClose={closeSettings}
              onSaved={setSettings}
            />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app app-enter">
      {environment}
      {topbar(false)}
      {about && settings && (
        <AboutDialog
          status={status}
          settings={settings}
          stations={stations}
          onClose={() => setAbout(false)}
        />
      )}
      {rail}
      {wide && (
        <WidgetColumns
          layout={widgetLayout}
          onChange={saveWidgets}
          wide={wide}
          data={widgetData}
        />
      )}
      <main className="stage" id="stage" tabIndex={-1} aria-label="Main content">
        <div className="route" role="region" aria-label="Dashboard">
          <div className="page">
            <h1 className="sr-only">Dashboard</h1>
            <p className="sr-only" role="status">
              {live}
            </p>

        {note && (
          <p className={`note ${note.tone}`} role="status" aria-live="polite">
            {note.text}
            {note.retry && (
              <button
                className="btn btn--ghost btn--mini"
                onClick={() => {
                  setNote(null)
                  void load()
                }}
              >
                Try again
              </button>
            )}
          </p>
        )}

        {loaded && (
          <div className="dashboard__top enter-item" style={{ '--i': 1 } as React.CSSProperties}>
            <section className="panel hero" aria-labelledby="focus-label">
              <div className="hero__top">
                <div className="hero__labels">
                  <h2 className="label" id="focus-label">
                    Focus
                  </h2>
                  <span className="hero__date">{date}</span>
                </div>
                <span className={`hero__synced${running ? ' is-syncing' : ''}`}>
                  <span
                    className={`status-dot status-dot--${anyError ? 'error' : 'ok'}`}
                    aria-hidden="true"
                  />
                  <span>
                    {running
                      ? `Syncing ${syncing ?? 'sources'}…`
                      : lastSync
                        ? `Synced ${time(lastSync)}`
                        : 'Ready'}
                  </span>
                </span>
              </div>

              <div className="hero__main">
                {start ? (
                  <>
                    {start.num !== undefined && (
                      <span className="hero__number">{start.num.toLocaleString('en-GB')}</span>
                    )}
                    <p className="hero__sentence" lang={contentLang(start.text)}>
                      {start.text}
                    </p>
                    <p className="hero__meta" lang={contentLang(start.meta)}>
                      {start.href ? (
                        <a
                          href={start.href}
                          target={start.href.startsWith('obsidian://') ? undefined : '_blank'}
                          rel={start.href.startsWith('obsidian://') ? undefined : 'noreferrer'}
                        >
                          {start.meta}
                        </a>
                      ) : (
                        start.meta
                      )}
                    </p>
                  </>
                ) : (
                  attention !== null && <p className="hero__sentence muted">Nothing needs attention.</p>
                )}
              </div>

              <div className="hero__foot">
                {start?.href ? (
                  <a
                    className="hero__arrow"
                    href={start.href}
                    target={start.href.startsWith('obsidian://') ? undefined : '_blank'}
                    rel={start.href.startsWith('obsidian://') ? undefined : 'noreferrer'}
                    aria-label={`Open ${start.meta}`}
                  >
                    <svg className="od-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M5 12h13M13.5 6.5L20 12l-6.5 5.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                ) : (
                  <span />
                )}
                <svg className="hero__glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 2.6v18.8M2.6 12h18.8M5.4 5.4l13.2 13.2M18.6 5.4L5.4 18.6"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </section>

            {today && settings && (
              <section className="panel today" aria-labelledby="today-label">
                <div className="today__head">
                  <h2 className="label" id="today-label">
                    Today
                  </h2>
                  <span className="today__date">
                    {new Date().toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                <div className="today__list">
                  {today.events.length === 0 && (
                    <p className="muted">
                      {settings.calendarConnected ? 'No events' : 'Calendar not connected'}
                    </p>
                  )}
                  {today.events.slice(0, TODAY_EVENTS).map((event) => (
                    <div key={event.id} className="event" dir="auto">
                      <span className="event__time">{eventTime(event)}</span>
                      <span className="event__title" lang={contentLang(event.summary)}>
                        {event.summary}
                      </span>
                    </div>
                  ))}
                  {today.conflicts.length > 0 && (
                    <p className="conflict">
                      Conflict:{' '}
                      <span lang={contentLang(today.conflicts.join(', '))}>
                        {today.conflicts.slice(0, 3).join(', ')}
                      </span>
                      {today.conflicts.length > 3 ? ` +${today.conflicts.length - 3}` : ''}
                    </p>
                  )}
                  {settings.calendarConnected &&
                    today.free.slice(0, 2).map((window) => (
                      <span key={window.from} className="free-window">
                        Free {time(window.from)}–{time(window.to)}
                      </span>
                    ))}
                </div>
                {today.events.length > TODAY_EVENTS && (
                  <a
                    className="today__more"
                    href="https://calendar.google.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    +{today.events.length - TODAY_EVENTS} more today
                  </a>
                )}
              </section>
            )}
          </div>
        )}

        {settings && status && !setupDone && (
          <section className="setup enter-item" aria-label="Setup progress">
            <span className="label label--mint">Get started</span>
            <div className="setup__steps">
              {setupSteps.map((step) => (
                <span key={step.label} className={`setup__step${step.done ? ' is-done' : ''}`}>
                  <span
                    className={`status-dot status-dot--${step.done ? 'ok' : 'hollow'}`}
                    aria-hidden="true"
                  />
                  {step.label}
                </span>
              ))}
            </div>
            <button className="btn btn--mini btn--ghost" onClick={toggleSettings}>
              Open settings
            </button>
          </section>
        )}

        {overlayPresence.mounted && overlay && (
          <section className="search-overlay" aria-label="Search results">
            <div
              className={`search-overlay__panel${overlayPresence.leaving ? ' is-leaving' : ''}`}
            >
              <header className="search-overlay__head">
                <span className="label">Results for “{overlay.query}”</span>
                <button type="button" className="btn btn--ghost btn--mini" onClick={clearSearch}>
                  Close
                </button>
              </header>
              {overlay.results.notes.length === 0 &&
                overlay.results.mail.length === 0 &&
                overlay.results.drive.length === 0 && <p className="empty">Nothing found.</p>}
              {overlay.results.notes.map((note) => (
                <a
                  key={note.path}
                  className="result"
                  href={obsidianUrl(vaultPath, note.path)}
                  title="Open in Obsidian"
                >
                  <span className="dot vault" />
                  <span className="label" lang={contentLang(note.path)}>
                    {note.path}
                  </span>
                </a>
              ))}
              {overlay.results.mail.map((message, index) => (
                <a
                  key={`mail-${index}`}
                  className="result"
                  href={mailUrl(message.messageId, message.subject)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Gmail"
                >
                  <span className="dot mail" />
                  <span className="label" lang={contentLang(message.subject)}>
                    {message.subject}
                  </span>
                  <span className="detail" lang={contentLang(message.sender)}>
                    {message.sender}
                  </span>
                </a>
              ))}
              {overlay.results.drive.map((file, index) => (
                <a
                  key={`drive-${index}`}
                  className="result"
                  href={driveUrl(file.id)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Google Drive"
                >
                  <span className="dot drive" />
                  <span className="label" lang={contentLang(file.name)}>
                    {file.name}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        <WidgetsInline
          layout={widgetLayout}
          onChange={saveWidgets}
          data={widgetData}
          includeSide={!wide}
        />

        <article
          className={`briefing enter-item${glow ? ' glow' : ''}`}
          aria-labelledby="briefing-label"
        >
          <header className="briefing__head">
            <div className="briefing__stamp-line">
              <h2 className="label label--ink" id="briefing-label">
                Briefing
              </h2>
              {latest && (
                <span className="briefing__stamp stamp">
                  {new Date(latest.created_at).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {` · ${latest.trigger}`}
                  {kindLabel(latest.kind)}
                  {briefingSpan(latest.digest_meta)
                    ? ` · ${briefingSpan(latest.digest_meta)}`
                    : ''}
                  {latest.digest_meta?.model === 'rules' ? ' · rules' : ''}
                  {latest.digest_meta?.grounding?.error ? ' · unverified' : ''}
                </span>
              )}
            </div>
            <button
              className="btn btn--primary btn--pill"
              onClick={() => void generate()}
              disabled={busy}
            >
              {busy
                ? 'Thinking…'
                : ageHours >= 6
                  ? `Refresh · ${ageHours} h old`
                  : 'Briefing now'}
            </button>
          </header>

          {latest && status && !status.briefingToday && (
            <span className="briefing__stamp stamp missing">none for today yet</span>
          )}
          {status?.briefingError && (
            <span className="briefing__stamp stamp failed">
              Briefing failed at {time(status.briefingError.at)}:{' '}
              {friendlyError(status.briefingError.message)}
            </span>
          )}

          <div className="briefing__body">
            {busy ? (
              <div className="briefing__skeleton" aria-hidden="true">
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton" />
              </div>
            ) : latest ? (
              <BriefingBody key={latest.id} briefing={latest} vaultPath={vaultPath} />
            ) : (
              briefings?.length === 0 &&
              loaded && (
                <p className="empty">
                  {settings && !settings.hasDeepSeekKey
                    ? 'Add a DeepSeek key to get your first briefing.'
                    : 'No briefing yet. Generate one whenever you are ready.'}
                </p>
              )
            )}

            {latest && !busy && (
              <div className="briefing__verdict">
                <div className="segmented" role="group" aria-label="Was this briefing useful?">
                  <button
                    type="button"
                    className="segmented__btn segmented__btn--good"
                    aria-pressed={latest.feedback === 'useful'}
                    disabled={voting}
                    onClick={() => void vote(latest.id, 'useful')}
                  >
                    Useful
                  </button>
                  <button
                    type="button"
                    className="segmented__btn segmented__btn--bad"
                    aria-pressed={latest.feedback === 'miss'}
                    disabled={voting}
                    onClick={() => void vote(latest.id, 'miss')}
                  >
                    Miss
                  </button>
                </div>
              </div>
            )}

            {latest && !busy && (
              <Disclosure
                className="ask"
                label="Ask about this"
                hint="Ask anything about today's briefing — the answer uses only what it read, never your notes. Up to 200 characters."
              >
                <form className="ask__form" onSubmit={(event) => void askAbout(event, latest.id)}>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="e.g. Why 47 mails?"
                    maxLength={200}
                    aria-label="Ask about this briefing"
                  />
                  <button
                    type="submit"
                    className="btn btn--mini btn--ghost"
                    disabled={asking || !question.trim()}
                  >
                    {asking ? 'Thinking…' : 'Ask'}
                  </button>
                </form>
                {answer && answer.id === latest.id && (
                  <p className="ask__answer" dir="auto" lang={contentLang(answer.text)}>
                    {answer.text}
                  </p>
                )}
              </Disclosure>
            )}

            <div className="briefing__disclosures">
              {(briefings?.length ?? 0) > 1 && (
                <Disclosure
                  label="Earlier briefings"
                  hint="The previous briefings, newest first, kept for comparison."
                >
                  {(briefings ?? []).slice(1).map((briefing) => (
                    <article key={briefing.id} className="earlier">
                      <span className="earlier__stamp">
                        {new Date(briefing.created_at).toLocaleString('en-GB', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        {kindLabel(briefing.kind)}
                        {briefing.opens > 0 ? ` · ${briefing.opens} opens` : ''}
                      </span>
                      <BriefingBody briefing={briefing} vaultPath={vaultPath} />
                    </article>
                  ))}
                </Disclosure>
              )}

              {latest?.digest && (
                <Disclosure
                  label="What it read"
                  hint="The digest sent to DeepSeek — the only thing that leaves this machine."
                >
                  <pre className="digest" lang={contentLang(latest.digest)}>{latest.digest}</pre>
                </Disclosure>
              )}
            </div>
          </div>
        </article>
          </div>
        </div>

        {groundingChecked && groundingPresence.mounted && (
          <aside
            className={`grounding-note${groundingPresence.leaving ? ' is-leaving' : ''}`}
            role="status"
          >
            <p>
              <strong>Strict grounding is on.</strong> Every point in the briefing was checked
              against the digest, and unsupported ones were dropped. The check uses extra tokens.
            </p>
            <div className="grounding-note__actions">
              <button type="button" className="btn btn--ghost btn--mini" onClick={disableGrounding}>
                Turn off
              </button>
              <button type="button" className="btn btn--primary btn--mini" onClick={dismissGrounding}>
                Got it
              </button>
            </div>
          </aside>
        )}
      </main>

      {welcome && settings && (
        <div
          className={`modal-backdrop${welcomeDialog.leaving ? ' leaving' : ''}`}
          onClick={() => welcomeDialog.close(dismissWelcome)}
        >
          <div
            ref={welcomeRef}
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Local Dashboard"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Welcome to Local Dashboard</h2>
            <p>
              Your notes, mail, calendar and Drive stay on this machine. Only a short digest —
              subjects, senders, the first lines of unread mail, and one line from an old note on
              quiet days — is sent to DeepSeek when you ask for a briefing.
            </p>
            <div className="row">
              <button
                className="btn btn--primary"
                onClick={() =>
                  welcomeDialog.close(() => {
                    dismissWelcome()
                    toggleSettings()
                  })
                }
              >
                Set up sources
              </button>
              <button className="btn btn--ghost" onClick={() => welcomeDialog.close(dismissWelcome)}>
                Explore first
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
