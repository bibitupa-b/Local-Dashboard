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
import { briefingLang } from './lang.js'
import { driveUrl, mailUrl, obsidianUrl, sourceUrl } from './links.js'
import { dialogOpen, useDialog, useLeaving } from './useDialog.js'
import { wallpaperById } from './wallpapers.js'

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
  'drive',
  'calendar',
  'browser',
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
  return (
    <div
      className="markdown"
      lang={briefingLang(`${body.headline} ${body.bullets.map((b) => b.text).join(' ')}`)}
    >
      {body.headline && (
        <h3 className="briefing__headline headline" dir="auto">
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
            <li key={`${index}-${bullet.text.slice(0, 24)}`} className="line point" dir="auto">
              <p>{bullet.text}</p>
              {(refs.length > 0 || why.length > 0) && (
                <div className="point__sources">
                  <span className="refs">
                    {refs.map(({ ref, href }, at) =>
                      href ? (
                        <a
                          key={at}
                          className="chip ref"
                          href={href}
                          target={href.startsWith('obsidian://') ? undefined : '_blank'}
                          rel={href.startsWith('obsidian://') ? undefined : 'noreferrer'}
                          onClick={() => void api.opened(id)}
                        >
                          <span
                            className="status-dot"
                            style={{ '--dot': `var(${refTint(ref.kind)})` } as React.CSSProperties}
                            aria-hidden="true"
                          />
                          {ref.label}
                        </a>
                      ) : (
                        <span key={at} className="chip chip--dead ref text">
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
                  {why.length > 0 && (
                    <details className="why">
                      <summary>Why</summary>
                      <div className="why-panel">
                        {why.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {body.suggestion && (
        <div className="suggestion line" dir="auto">
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
    <div className="markdown" lang={briefingLang(markdown)}>
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

/** The sand rule follows the line at the middle of the viewport: reading position, not decoration. */
function useReadingLine(key: string | number | undefined, visible: boolean) {
  useEffect(() => {
    if (!visible || typeof IntersectionObserver === 'undefined') return undefined
    const lines = [...document.querySelectorAll<HTMLElement>('.briefing .point')]
    let current: HTMLElement | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.target === current) continue
          current?.classList.remove('is-reading')
          current = entry.target as HTMLElement
          current.classList.add('is-reading')
        }
      },
      { rootMargin: '-42% 0px -52% 0px' },
    )
    lines.forEach((line) => observer.observe(line))
    return () => {
      observer.disconnect()
      current?.classList.remove('reading')
    }
  }, [key, visible])
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [attention, setAttention] = useState<AttentionItem[] | null>(null)
  const [briefings, setBriefings] = useState<Briefing[] | null>(null)
  const [today, setToday] = useState<Today | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
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
  const [live, setLive] = useState('')

  async function load() {
    const [statusRes, attentionRes, briefingsRes, settingsRes, todayRes] = await Promise.allSettled(
      [api.status(), api.attention(), api.briefings(), api.settings(), api.today()] as const,
    )
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

  useEffect(() => {
    const update = () => document.body.classList.toggle('motion-paused', document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
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
    withViewTransition(() => setShowSettings((value) => !value))
  }

  function closeSettings(): void {
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

  async function search(event: React.FormEvent) {
    event.preventDefault()
    const term = query.trim()
    if (term.length < 2) {
      setResults(null)
      setResultsQuery('')
      setNote({ text: 'Type at least 2 characters to search.', tone: 'info' })
      return
    }
    try {
      const found = await api.search(term)
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
      setNote({
        text: friendlyError(error instanceof Error ? error.message : String(error)),
        tone: 'error',
      })
    }
  }

  type Suggestion = { kind: 'note' | 'mail' | 'drive'; label: string; detail?: string; url: string }

  const vaultPath = settings?.vaultPath ?? ''
  const items: Suggestion[] = suggestions
    ? [
        ...suggestions.notes.map((note) => ({
          kind: 'note' as const,
          label: note.path,
          url: obsidianUrl(vaultPath, note.path),
        })),
        ...suggestions.mail.map((message) => ({
          kind: 'mail' as const,
          label: message.subject,
          detail: message.sender,
          url: mailUrl(message.messageId, message.subject),
        })),
        ...suggestions.drive.map((file) => ({
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

  function choose(item?: Suggestion) {
    const target = item ?? items[activeSuggestion]
    if (!target) return
    setSuggestions(null)
    open(target.url)
  }

  function onSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestion((index) => (index + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestion((index) => (index - 1 + items.length) % items.length)
    } else if (event.key === 'Escape') {
      setSuggestions(null)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose()
    }
  }

  const latest = briefings?.[0]
  // Stale is a fact about today's briefing only; an old one from yesterday is not "today's".
  const ageHours =
    latest && status?.briefingToday ? briefingAgeHours(latest.created_at, Date.now()) : 0
  // The settings route unmounts the briefing, so the observer is rebuilt when it returns.
  useReadingLine(latest?.id, !showSettings)
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
    setQuery('')
    setResults(null)
    setResultsQuery('')
    setSuggestions(null)
  }

  const environment = (
    <div className={`environment${wall.full ? ' environment--photo' : ''}`} aria-hidden="true">
      {wall.full && (
        <div className="environment__photo" style={{ backgroundImage: `url(${wall.full})` }} />
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
          const body = (
            <>
              <SourceGlyph service={station.service} />
              <span className={`status-dot status-dot--${railState(station)}`} aria-hidden="true" />
              <span className="sr-only">{name}</span>
              <span className="sr-only">{detail}</span>
            </>
          )
          const active = running && activeService === station.service
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
      </button>
    </nav>
  )

  function topbar(isSettings: boolean) {
    const failed = stations.some((station) => station.error)
    return (
      <header className="topbar">
        <div className="topbar__left">
          <button
            type="button"
            className="brand"
            onClick={isSettings ? closeSettings : undefined}
            aria-label="Local Dashboard"
          >
            <img className="brand__mark" src="/icon-transparent-96.png" alt="" />
            <span className="brand__text">
              <span className="brand__name">Local Dashboard</span>
              <span className="brand__date">{date}</span>
            </span>
          </button>
        </div>

        <div className="topbar__center">
          {isSettings ? (
            <div className="topbar__crumb" aria-label="Settings">
              <span>Settings</span>
            </div>
          ) : (
            <form
              className="command search-wrap"
              onSubmit={(event) => void search(event)}
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
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKey}
                onBlur={() => setSuggestions(null)}
                placeholder="Search notes, mail and Drive…"
                autoComplete="off"
                role="combobox"
                aria-label="Search notes, mail and Drive"
                aria-controls={items.length > 0 ? 'search-suggestions' : undefined}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-expanded={items.length > 0}
                aria-activedescendant={
                  items.length > 0 ? `search-option-${activeSuggestion}` : undefined
                }
              />
              <kbd className="command__key" aria-hidden="true">
                /
              </kbd>
              <button type="submit" className="sr-only">
                Search
              </button>
              {items.length > 0 && (
                <div className="suggest" id="search-suggestions" role="listbox">
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
                        aria-selected={activeSuggestion === index}
                        className={`item${activeSuggestion === index ? ' active' : ''}`}
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
                        <span className="label">{item.label}</span>
                        {item.detail && <span className="detail">{item.detail}</span>}
                      </div>
                    </Fragment>
                  ))}
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
            <span className="sync__dot" aria-hidden="true" />
            <span className="sync__bar" aria-hidden="true">
              <i style={{ width: `${running ? progress : fill}%` }} />
            </span>
            <span className="sync__text">
              {running ? 'Syncing…' : failed ? 'Sync failed' : lastSync ? `Synced ${time(lastSync)}` : 'Sync now'}
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
        {rail}
        <main className="stage glass" id="stage" tabIndex={-1} aria-label="Main content">
          <div className="route" role="region" aria-label="Settings">
            <SettingsPanel settings={settings} onClose={closeSettings} onSaved={setSettings} />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app app-enter">
      {environment}
      {topbar(false)}
      {rail}
      <main className="stage glass" id="stage" tabIndex={-1} aria-label="Main content">
        <div className="route" role="region" aria-label="Dashboard">
          <div className="page">
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
                  <span className="label" id="focus-label">
                    Focus
                  </span>
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
                    <p className="hero__sentence">{start.text}</p>
                    <p className="hero__meta">
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
                  <span className="label" id="today-label">
                    Today
                  </span>
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
                      <span className="event__title">{event.summary}</span>
                    </div>
                  ))}
                  {today.conflicts.length > 0 && (
                    <p className="conflict">
                      Conflict: {today.conflicts.slice(0, 3).join(', ')}
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

        {results && resultsQuery && (
          <section className="search-overlay" aria-label="Search results">
            <div className="search-overlay__panel">
              <header className="search-overlay__head">
                <span className="label">Results for “{resultsQuery}”</span>
                <button type="button" className="btn btn--ghost btn--mini" onClick={clearSearch}>
                  Close
                </button>
              </header>
              {results.notes.length === 0 && results.mail.length === 0 && results.drive.length === 0 && (
                <p className="empty">Nothing found.</p>
              )}
              {results.notes.map((note) => (
                <a
                  key={note.path}
                  className="result"
                  href={obsidianUrl(vaultPath, note.path)}
                  title="Open in Obsidian"
                >
                  <span className="dot vault" />
                  <span className="label">{note.path}</span>
                </a>
              ))}
              {results.mail.map((message, index) => (
                <a
                  key={`mail-${index}`}
                  className="result"
                  href={mailUrl(message.messageId, message.subject)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Gmail"
                >
                  <span className="dot mail" />
                  <span className="label">{message.subject}</span>
                  <span className="detail">{message.sender}</span>
                </a>
              ))}
              {results.drive.map((file, index) => (
                <a
                  key={`drive-${index}`}
                  className="result"
                  href={driveUrl(file.id)}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Google Drive"
                >
                  <span className="dot drive" />
                  <span className="label">{file.name}</span>
                </a>
              ))}
            </div>
          </section>
        )}

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
              </div>
            ) : latest ? (
              <BriefingBody briefing={latest} vaultPath={vaultPath} />
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
                    className="segmented__btn"
                    aria-pressed={latest.feedback === 'useful'}
                    disabled={voting}
                    onClick={() => void vote(latest.id, 'useful')}
                  >
                    Useful
                  </button>
                  <button
                    type="button"
                    className="segmented__btn"
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
              <details className="ask">
                <summary className="ask__toggle">Ask about this</summary>
                <div className="ask__panel">
                  <form className="ask__form" onSubmit={(event) => void askAbout(event, latest.id)}>
                    <input
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      placeholder="Why 47 mails?"
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
                  <p className="ask__hint">Max 200 characters.</p>
                  {answer && answer.id === latest.id && (
                    <p className="ask__answer" dir="auto">
                      {answer.text}
                    </p>
                  )}
                </div>
              </details>
            )}

            <div className="briefing__disclosures">
              {(briefings?.length ?? 0) > 1 && (
                <details className="disclosure">
                  <summary>
                    <span>Earlier briefings</span>
                  </summary>
                  <div className="disclosure__body">
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
                  </div>
                </details>
              )}

              {latest?.digest && (
                <details className="disclosure">
                  <summary>
                    <span>What it read</span>
                  </summary>
                  <div className="disclosure__body">
                    <pre className="digest">{latest.digest}</pre>
                  </div>
                </details>
              )}
            </div>
          </div>
        </article>
          </div>
        </div>
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
