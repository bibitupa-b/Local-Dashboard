import { Fragment, useEffect, useRef, useState } from 'react'
import {
  api,
  type AttentionItem,
  type Briefing,
  type SearchResults,
  type Settings,
  type Status,
  type Today,
} from './api.js'
import { SettingsPanel } from './Settings.js'
import { friendlyError } from './errors.js'
import { driveUrl, mailUrl, obsidianUrl, sourceUrl } from './links.js'

const SERVICE_LABELS: Record<string, string> = {
  vault: 'vault',
  google: 'drive',
  imap: 'mail',
  github: 'github',
  browser: 'browser',
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
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

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

function BriefingBody({ markdown }: { markdown: string }) {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const bullets = lines
    .map((line) => line.match(/^[-*•]\s+(.*)$/)?.[1])
    .filter((text): text is string => Boolean(text))

  if (bullets.length === lines.length && bullets.length > 0) {
    return (
      <div className="markdown">
        <ul>
          {bullets.map((text, index) => {
            // The closing line is the suggestion, labelled or not.
            const suggestion = index === bullets.length - 1
            const body = suggestion
              ? text.replace(/^(suggestion|предложение|рекомендация)\s*[:—-]\s*/i, '')
              : text
            return (
              <li
                key={`${index}-${text.slice(0, 24)}`}
                className={`line${suggestion ? ' suggestion' : ''}`}
              >
                {suggestion && <span className="suggestion-label">Suggestion</span>}
                {body}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="markdown">
      {lines.map((line, index) => (
        <p className="line" key={`${index}-${line.slice(0, 24)}`}>
          {line}
        </p>
      ))}
    </div>
  )
}

/** The sand rule follows the line at the middle of the viewport: reading position, not decoration. */
function useReadingLine(key: string | number | undefined) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
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
  }, [key])
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [attention, setAttention] = useState<AttentionItem[]>([])
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [today, setToday] = useState<Today | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [note, setNote] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
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

  async function load() {
    try {
      const [nextStatus, nextAttention, nextBriefings, nextSettings, nextToday] =
        await Promise.all([
          api.status(),
          api.attention(),
          api.briefings(),
          api.settings(),
          api.today(),
        ])
      setStatus(nextStatus)
      setAttention(nextAttention)
      setBriefings(nextBriefings.items)
      setSettings(nextSettings)
      setToday(nextToday)
      setLoaded(true)
    } catch (error) {
      setNote({
        text: error instanceof Error ? error.message : 'Backend is not reachable',
        tone: 'error',
      })
    }
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

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 60_000)
    const statusTimer = setInterval(() => {
      void api.status().then(setStatus).catch(() => {})
    }, 3000)
    return () => {
      clearInterval(timer)
      clearInterval(statusTimer)
    }
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions(null)
      return
    }
    const handle = setTimeout(() => {
      api
        .search(query.trim())
        .then((found) => {
          setSuggestions(found)
          setActiveSuggestion(0)
        })
        .catch(() => setSuggestions(null))
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    const update = () => document.body.classList.toggle('motion-paused', document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (!glow) return
    const timer = setTimeout(() => setGlow(false), 900)
    return () => clearTimeout(timer)
  }, [glow])

  useEffect(() => {
    if (!status) return
    if (wasRunning.current && !status.sync.running) {
      setSyncOutcome(status.sources.some((source) => source.lastError) ? 'error' : 'ok')
      const timer = setTimeout(() => setSyncOutcome(null), 1600)
      wasRunning.current = false
      return () => clearTimeout(timer)
    }
    wasRunning.current = status.sync.running
    return undefined
  }, [status])

  useEffect(() => {
    if (showSettings) return
    const onKey = (event: KeyboardEvent) => {
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

  async function generate() {
    setBusy(true)
    setNote(null)
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
          { id: Date.now(), created_at: new Date().toISOString(), trigger: 'manual', markdown: result.markdown },
          ...items,
        ])
        setStatus((current) => (current ? { ...current, briefingToday: true } : current))
        setGlow(true)
      }
    } catch (error) {
      setNote({
        text: `Briefing failed: ${friendlyError(
          error instanceof Error ? error.message : String(error),
        )}`,
        tone: 'error',
      })
    } finally {
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

  const isElectron = navigator.userAgent.includes('Electron')
  const [splash, setSplash] = useState<'visible' | 'leaving' | 'hidden'>(
    isElectron ? 'hidden' : 'visible',
  )

  useEffect(() => {
    if (splash === 'hidden') return
    const leave = setTimeout(() => setSplash('leaving'), 1100)
    const hide = setTimeout(() => setSplash('hidden'), 1480)
    return () => {
      clearTimeout(leave)
      clearTimeout(hide)
    }
  }, [])

  const latest = briefings[0]
  useReadingLine(latest?.id)

  if (showSettings && settings) {
    return (
      <div className="page app-enter">
        <SettingsPanel
          settings={settings}
          onClose={closeSettings}
          onSaved={(next) => {
            setSettings(next)
            setNote({ text: 'Preferences saved.', tone: 'success' })
          }}
        />
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

  const running = status?.sync.running ?? false
  const activeService = status?.sources.find((source) => source.id === status.sync.source)?.service
  const progress = !status
    ? 0
    : syncOutcome
      ? 100
      : Math.round(
          ((status.sync.sourceIndex + status.sync.done / Math.max(status.sync.total, 1)) /
            Math.max(status.sync.sourceTotal, 1)) *
            100,
        )

  const setupSteps = [
    {
      label: 'Connect a vault',
      done: status?.sources.some((source) => source.kind === 'vault' && source.configured) ?? false,
    },
    { label: 'Add a DeepSeek key', done: settings?.hasDeepSeekKey ?? false },
    { label: 'Generate the first briefing', done: briefings.length > 0 },
  ]
  const setupDone = setupSteps.every((step) => step.done)

  const first = START_ORDER.map((kind) => attention.find((item) => item.kind === kind)).find(
    (item): item is AttentionItem => Boolean(item),
  )
  const start = first ? { ...startPoint(first), href: attentionHref(first) } : null

  return (
    <div className="page app-enter">
      {splash !== 'hidden' && (
        <div className={`boot${splash === 'leaving' ? ' leaving' : ''}`} aria-hidden="true">
          <div className="boot-emblem">
            <span className="boot-ring" />
            <img src="/icon-transparent.png" alt="" />
          </div>
          <div className="boot-title">Local Dashboard</div>
          <div className="boot-bar">
            <span />
          </div>
        </div>
      )}

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
            onClick={() => {
              void api
                .sync()
                .then(load)
                .catch((error: unknown) =>
                  setNote({
                    text: friendlyError(error instanceof Error ? error.message : String(error)),
                    tone: 'error',
                  }),
                )
            }}
          >
            Sync
          </button>
          <button className="ghost" onClick={toggleSettings}>
            Settings
          </button>
        </div>
      </header>

      <main>
        {note && (
          <p className={`note ${note.tone}`} role="status" aria-live="polite">
            {note.text}
          </p>
        )}

        {loaded && (
          <div className="panel enter-item" style={{ '--i': 1 } as React.CSSProperties}>
            <section className="start">
            {start ? (
              <>
                <p className="start-line">
                  <span className="cue">Start here:</span>{' '}
                  {start.num !== undefined && <b>{start.num}</b>} {start.text}
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
              loaded && <p className="start-line muted">Nothing needs attention.</p>
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
              {today.events.map((event) => (
                <p key={event.id} className="event">
                  <b>{time(event.start)}</b> {event.summary}
                </p>
              ))}
              {today.conflicts.length > 0 && (
                <p className="conflict">Conflict: {today.conflicts.join(', ')}</p>
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
          role={running ? 'progressbar' : undefined}
          aria-label={
            running
              ? `Syncing ${status?.sync.source ?? 'sources'}`
              : 'Connected services and their last sync'
          }
          aria-valuemin={running ? 0 : undefined}
          aria-valuemax={running ? 100 : undefined}
          aria-valuenow={running ? progress : undefined}
        >
          {stations.length > 0 && (
            <span className="rail" aria-hidden="true">
              <i style={{ width: `${progress}%` }} />
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
                  {station.total > 1 ? ` · ${station.total}` : ''}
                </span>
                <span className="mark" />
                <span className="at">{station.lastSync ? time(station.lastSync) : '—'}</span>
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
              placeholder="Search notes, mail and Drive…"
              autoComplete="off"
              role="combobox"
              aria-label="Search notes, mail and Drive"
              aria-controls="search-suggestions"
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
                      <div className="group">
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
            <p className="section-label">Results for “{resultsQuery}”</p>
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
            <h2>Briefing</h2>
            {latest && (
              <time className="stamp" dateTime={latest.created_at}>
                {new Date(latest.created_at).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            )}
            <button className="primary" onClick={() => void generate()} disabled={busy}>
              {busy ? 'Thinking…' : 'Briefing now'}
            </button>
            {latest && status && !status.briefingToday && (
              <span className="stamp">none for today yet</span>
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
              <BriefingBody markdown={latest.markdown} />
            ) : (
              loaded && (
                <p className="empty">
                  {settings && !settings.hasDeepSeekKey
                    ? 'Add a DeepSeek key to get your first briefing.'
                    : 'No briefing yet. Generate one whenever you are ready.'}
                </p>
              )
            )}

            {briefings.length > 1 && (
              <details className="earlier">
                <summary>Earlier briefings</summary>
                {briefings.slice(1).map((briefing) => (
                  <article key={briefing.id}>
                    <h3>
                      {new Date(briefing.created_at).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </h3>
                    <BriefingBody markdown={briefing.markdown} />
                  </article>
                ))}
              </details>
            )}
          </div>
        </article>
      </main>

      {welcome && (
        <div className="modal-backdrop" onClick={dismissWelcome}>
          <div
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-label="Welcome to Local Dashboard"
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
                onClick={() => {
                  dismissWelcome()
                  toggleSettings()
                }}
              >
                Set up sources
              </button>
              <button className="ghost" onClick={dismissWelcome}>
                Explore first
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
