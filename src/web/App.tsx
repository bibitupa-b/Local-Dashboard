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

function BriefingBody({ briefing, vaultPath }: { briefing: Briefing; vaultPath: string }) {
  return briefing.body ? (
    <BriefingPoints body={briefing.body} vaultPath={vaultPath} />
  ) : (
    <LegacyBriefingBody markdown={briefing.markdown} />
  )
}

/** Structured answer: a headline to read first, points that open their source, one suggestion. */
function BriefingPoints({ body, vaultPath }: { body: BriefingBody; vaultPath: string }) {
  return (
    <div className="markdown" lang={briefingLang(`${body.headline} ${body.bullets.map((b) => b.text).join(' ')}`)}>
      {body.headline && (
        <p className="headline" dir="auto">
          {body.headline}
        </p>
      )}
      <ul>
        {body.bullets.map((bullet, index) => (
          <li key={`${index}-${bullet.text.slice(0, 24)}`} className="line" dir="auto">
            {bullet.text}
            {bullet.refs.length > 0 && (
              <span className="refs">
                {bullet.refs.map((ref, at) => {
                  const href = refHref(ref, vaultPath)
                  return href ? (
                    <a
                      key={at}
                      className="ref"
                      href={href}
                      target={href.startsWith('obsidian://') ? undefined : '_blank'}
                      rel={href.startsWith('obsidian://') ? undefined : 'noreferrer'}
                    >
                      {ref.label}
                    </a>
                  ) : (
                    <span key={at} className="ref text">
                      {ref.label}
                    </span>
                  )
                })}
              </span>
            )}
          </li>
        ))}
        {body.suggestion && (
          <li className="line suggestion" dir="auto">
            <span className="suggestion-label" lang="en">
              Suggestion
            </span>
            {body.suggestion}
          </li>
        )}
      </ul>
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

function LegacyBriefingBody({ markdown }: { markdown: string }) {
  // A bullet and a plain line are the same entry; the marker is punctuation, not content.
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
      <ul>
        {entries.map((text, index) => {
          // The closing entry is the suggestion — but a one-line briefing has no closing entry.
          const suggestion = index === entries.length - 1 && entries.length > 1
          const body = suggestion
            ? text.replace(/^(suggestion|предложение|рекомендация)\s*[:—-]\s*/i, '')
            : text
          return (
            <li
              key={`${index}-${text.slice(0, 24)}`}
              className={`line${suggestion ? ' suggestion' : ''}`}
              dir="auto"
            >
              {suggestion && (
                <span className="suggestion-label" lang="en">
                  Suggestion
                </span>
              )}
              {body}
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
    const lines = [...document.querySelectorAll<HTMLElement>('.briefing .line')]
    let current: HTMLElement | null = null
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.target === current) continue
          current?.classList.remove('reading')
          current = entry.target as HTMLElement
          current.classList.add('reading')
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
  const settingsButton = useRef<HTMLButtonElement>(null)
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
    else settingsButton.current?.focus()
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

  async function generate() {    // One paid call at a time: a held key repeats and must not spend twice.
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
  // The settings route unmounts the briefing, so the observer is rebuilt when it returns.
  useReadingLine(latest?.id, !showSettings)
  const welcomeDialog = useLeaving()
  const welcomeRef = useDialog<HTMLDivElement>(welcome && Boolean(settings), () =>
    welcomeDialog.close(dismissWelcome),
  )

  if (showSettings && settings) {
    return (
      <div className="page app-enter">
        <main>
          <SettingsPanel
            settings={settings}
            onClose={closeSettings}
            onSaved={setSettings}
          />
        </main>
      </div>
    )
  }

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

  return (
    <div className="page app-enter">
      <header className="masthead enter-item" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="ident">
          <span className="brand-mark">
            <img src="/icon-transparent.png" alt="" />
            <span className="brand-orbit" />
          </span>
          <div>
            <h1>Local Dashboard</h1>
            <p className="sub">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>
        </div>
        <div className="head-actions">
          <button
            className="ghost"
            disabled={running}
            onClick={() => {
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
            }}
          >
            Sync
          </button>
          <button
            ref={settingsButton}
            className="ghost"
            onClick={toggleSettings}
            disabled={!settings}
            title={settings ? undefined : 'Settings are available once the local server responds.'}
          >
            Settings
          </button>
        </div>
      </header>

      <main>
        <p className="sr-only" role="status">
          {live}
        </p>

        {note && (
          <p className={`note ${note.tone}`} role="status" aria-live="polite">
            {note.text}
            {note.retry && (
              <button
                className="mini"
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
          <div className="panel enter-item" style={{ '--i': 1 } as React.CSSProperties}>
            <section className="start">
              {start ? (
                <>
                  <p className="start-line">
                    <span className="cue">Start here:</span>{' '}
                    {start.num !== undefined && <b>{start.num.toLocaleString('en-GB')}</b>}{' '}
                    {start.text}
                  </p>
                  <p className="start-meta">
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
                attention !== null && <p className="start-line muted">Nothing needs attention.</p>
              )}
            </section>

          {today && settings && (
            <section className="today">
              <span className="section-label">Today</span>
              {today.events.length === 0 && (
                <p className="muted">
                  {settings.calendarConnected ? 'No events' : 'Calendar not connected'}
                </p>
              )}
              {today.events.slice(0, TODAY_EVENTS).map((event) => (
                <p key={event.id} className="event" dir="auto">
                  <b>{eventTime(event)}</b> {event.summary}
                </p>
              ))}
              {today.events.length > TODAY_EVENTS && (
                <p className="muted">
                  <a href="https://calendar.google.com" target="_blank" rel="noreferrer">
                    +{today.events.length - TODAY_EVENTS} more today
                  </a>
                </p>
              )}
              {today.conflicts.length > 0 && (
                <p className="conflict">
                  Conflict: {today.conflicts.slice(0, 3).join(', ')}
                  {today.conflicts.length > 3 ? ` +${today.conflicts.length - 3}` : ''}
                </p>
              )}
              {settings.calendarConnected &&
                today.free.slice(0, 2).map((window) => (
                  <p key={window.from} className="free">
                    Free {time(window.from)}–{time(window.to)}
                  </p>
                ))}
            </section>
          )}
          </div>
        )}

        <section
          className={`network enter-item${syncOutcome ? ` outcome-${syncOutcome}` : ''}${
            running ? ' running' : ''
          }`}
          style={{ '--i': 2 } as React.CSSProperties}
          aria-label="Connected services and their last sync"
        >
          {stations.length > 0 && (
            <span
              className="rail"
              aria-hidden={running ? undefined : true}
              role={running ? 'progressbar' : undefined}
              aria-label={running ? `Syncing ${syncing ?? 'sources'}` : undefined}
              aria-valuemin={running ? 0 : undefined}
              aria-valuemax={running ? 100 : undefined}
              aria-valuenow={running ? progress : undefined}
            >
              <i style={{ width: `${fill}%` }} />
            </span>
          )}
          {stations.length === 0 && status && (
            <p className="muted">No sources connected yet.</p>
          )}
          {stations.map((station) => {
            const name = SERVICE_LABELS[station.service] ?? station.service
            const url = sourceUrl(station.service, vaultPath)
            const state = station.error ? 'bad' : station.configured > 0 ? 'ok' : 'off'
            const detail = station.error
              ? friendlyError(station.error)
              : station.lastSync
                ? `Last synced ${time(station.lastSync)}`
                : station.configured > 0
                  ? 'Waiting for the first sync'
                  : 'Not connected'
            const body = (
              <>
                <span className="name">
                  {name}
                  {station.total > 1 && <span aria-hidden="true"> · {station.total}</span>}
                  {/* The station's accessible name: service, state, and where the link goes. */}
                  <span className="sr-only">
                    {`, ${[
                      station.total > 1 ? `${station.total} accounts` : null,
                      detail,
                      url ? (OPEN_LABELS[station.service] ?? 'opens the service') : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}`}
                  </span>
                </span>
                <span className="mark" />
                <span className={`at${station.error ? ' bad' : ''}`} aria-hidden="true">
                  {station.error ? 'error' : station.lastSync ? time(station.lastSync) : '—'}
                </span>
              </>
            )
            return url ? (
              <a
                key={station.service}
                className={`station ${station.service} ${state}${
                  running && activeService === station.service ? ' active' : ''
                }`}
                href={url}
                title={detail}
                target={url.startsWith('obsidian://') ? undefined : '_blank'}
                rel={url.startsWith('obsidian://') ? undefined : 'noreferrer'}
              >
                {body}
              </a>
            ) : (
              <span
                key={station.service}
                className={`station ${station.service} ${state}${
                  running && activeService === station.service ? ' active' : ''
                }`}
                title={detail}
              >
                {body}
              </span>
            )
          })}
        </section>

        {settings && status && !setupDone && (
          <section className="setup enter-item" style={{ '--i': 3 } as React.CSSProperties}>
            <span className="section-label">Get started</span>
            <ul>
              {setupSteps.map((step) => (
                <li key={step.label} className={step.done ? 'done' : ''}>
                  <span className="tick" aria-hidden="true" />
                  <span>{step.label}</span>
                </li>
              ))}
            </ul>
            <button className="ghost mini" onClick={toggleSettings}>
              Open settings
            </button>
          </section>
        )}

        <form
          className="search enter-item"
          style={{ '--i': 3 } as React.CSSProperties}
          onSubmit={(event) => void search(event)}
        >
          <div className="search-wrap">
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
                        {item.kind === 'note' ? 'Note' : item.kind === 'mail' ? 'Mail' : 'Drive'}:{' '}
                      </span>
                      <span className="label">{item.label}</span>
                      {item.detail && <span className="detail">{item.detail}</span>}
                    </div>
                  </Fragment>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="ghost">
            Search
          </button>
          {results && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setQuery('')
                setResults(null)
                setResultsQuery('')
                setSuggestions(null)
              }}
            >
              Clear
            </button>
          )}
        </form>

        {results && resultsQuery && (
          <section className="results enter-item">
            <p className="section-label">
            Results for <span className="query">“{resultsQuery}”</span>
          </p>
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
          </section>
        )}

        <article
          className={`briefing enter-item${glow ? ' glow' : ''}`}
          style={{ '--i': 4 } as React.CSSProperties}
        >
          <div className="briefing-margin">
            <h2 className="section-label">Briefing</h2>
            {latest && (
              <time className="stamp" dateTime={latest.created_at}>
                {new Date(latest.created_at).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {` · ${latest.trigger}`}
                {briefingSpan(latest.digest_meta) ? ` · ${briefingSpan(latest.digest_meta)}` : ''}
              </time>
            )}
            <button className="primary" onClick={() => void generate()} disabled={busy}>
              {busy ? 'Thinking…' : 'Briefing now'}
            </button>
            {latest && status && !status.briefingToday && (
              <span className="stamp missing">none for today yet</span>
            )}
            {status?.briefingError && (
              <span className="stamp failed">
                Briefing failed at {time(status.briefingError.at)}:{' '}
                {friendlyError(status.briefingError.message)}
              </span>
            )}
          </div>

          <div className="briefing-body">
            {busy ? (
              <div className="skeleton" aria-hidden="true">
                <span />
                <span />
                <span />
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
              <div className="feedback" role="group" aria-label="Was this briefing useful?">
                <button
                  type="button"
                  className="mini"
                  aria-pressed={latest.feedback === 'useful'}
                  disabled={voting}
                  onClick={() => void vote(latest.id, 'useful')}
                >
                  Useful
                </button>
                <button
                  type="button"
                  className="mini"
                  aria-pressed={latest.feedback === 'miss'}
                  disabled={voting}
                  onClick={() => void vote(latest.id, 'miss')}
                >
                  Miss
                </button>
              </div>
            )}

            {(briefings?.length ?? 0) > 1 && (              <details className="earlier">
                <summary>Earlier briefings</summary>
                {(briefings ?? []).slice(1).map((briefing) => (
                  <article key={briefing.id}>
                    <h3>
                      {new Date(briefing.created_at).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </h3>
                    <BriefingBody briefing={briefing} vaultPath={vaultPath} />
                  </article>
                ))}
              </details>
            )}
          </div>
        </article>
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
              subjects, senders and the first lines of unread mail — is sent to DeepSeek when you
              ask for a briefing.
            </p>
            <div className="row">
              <button
                className="primary"
                onClick={() =>
                  welcomeDialog.close(() => {
                    dismissWelcome()
                    toggleSettings()
                  })
                }
              >
                Set up sources
              </button>
              <button className="ghost" onClick={() => welcomeDialog.close(dismissWelcome)}>
                Explore first
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
