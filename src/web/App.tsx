import { Fragment, useEffect, useRef, useState } from 'react'
import {
  api,
  type AttentionItem,
  type Briefing,
  type FeedDay,
  type SearchResults,
  type Settings,
  type Status,
  type SyncState,
  type Today,
} from './api.js'
import { SettingsPanel } from './Settings.js'
import { friendlyError } from './errors.js'
import { driveUrl, mailUrl, obsidianUrl, sourceUrl } from './links.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const SERVICE_LABELS: Record<string, string> = {
  vault: 'vault',
  google: 'drive',
  imap: 'mail',
  github: 'github',
  browser: 'browser',
}

function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [feed, setFeed] = useState<FeedDay[]>([])
  const [attention, setAttention] = useState<AttentionItem[]>([])
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [today, setToday] = useState<Today | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
  } | null>(null)
  const [glow, setGlow] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [syncOutcome, setSyncOutcome] = useState<'ok' | 'error' | null>(null)
  const wasRunning = useRef(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [resultsQuery, setResultsQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResults | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [openDiff, setOpenDiff] = useState<{ id: number; path: string; diff: string } | null>(null)
  const [expandedDays, setExpandedDays] = useState<string[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const [nextStatus, nextFeed, nextAttention, nextBriefings, nextSettings, nextToday] =
        await Promise.all([
          api.status(),
          api.feed(),
          api.attention(),
          api.briefings(),
          api.settings(),
          api.today(),
        ])
      setStatus(nextStatus)
      setFeed(nextFeed.days)
      setAttention(nextAttention)
      setBriefings(nextBriefings.items)
      setSettings(nextSettings)
      setToday(nextToday)
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
    const timer = setTimeout(() => setGlow(false), 700)
    return () => clearTimeout(timer)
  }, [glow])

  useEffect(() => {
    if (!status) return
    if (wasRunning.current && !status.sync.running) {
      setSyncOutcome(status.sources.some((source) => source.lastError) ? 'error' : 'ok')
      const timer = setTimeout(() => setSyncOutcome(null), 1400)
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

  async function toggleDiff(id: number) {
    if (openDiff?.id === id) {
      setOpenDiff(null)
      return
    }
    try {
      setOpenDiff({ id, ...(await api.vaultChange(id)) })
    } catch (error) {
      setNote({
        text: friendlyError(error instanceof Error ? error.message : String(error)),
        tone: 'error',
      })
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

  const statusGroups = (() => {
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
    return [...map.values()]
  })()

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
      <header className="head enter-item" style={{ '--i': 0 } as React.CSSProperties}>
        <div className="brand">
          <span className="brand-mark">
            <img src="/icon-transparent.png" alt="" />
            <span className="brand-orbit" />
          </span>
          <div>
            <h1>Local Dashboard</h1>
            <p className="sub">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <div className="status">
          <div className="pills">
            {statusGroups.map((group) => {
              const url = sourceUrl(group.service, vaultPath)
              const className = `pill ${group.configured > 0 ? 'ok' : 'off'}${group.error ? ' bad' : ''}`
              const title = group.error ? friendlyError(group.error) : `${group.configured}/${group.total} connected`
              const name = SERVICE_LABELS[group.service] ?? group.service
              const label = (
                <>
                  {name}
                  {group.total > 1 ? ` · ${group.total}` : ''}
                  {group.lastSync
                    ? ` · ${time(group.lastSync)}`
                    : group.configured > 0
                      ? ''
                      : ' · not connected'}
                </>
              )
              return url ? (
                <a
                  key={group.service}
                  className={className}
                  href={url}
                  title={title}
                  target={url.startsWith('obsidian://') ? undefined : '_blank'}
                  rel={url.startsWith('obsidian://') ? undefined : 'noreferrer'}
                >
                  {label}
                </a>
              ) : (
                <span key={group.service} className={className} title={title}>
                  {label}
                </span>
              )
            })}
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
                      text: friendlyError(
                        error instanceof Error ? error.message : String(error),
                      ),
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
        </div>
      </header>

      {(status?.sync.running || syncOutcome) && status && (
        <div
          className={`syncbar${syncOutcome ? ` done ${syncOutcome}` : ''}`}
          role="progressbar"
          aria-label={
            syncOutcome
              ? syncOutcome === 'ok'
                ? 'Sync completed'
                : 'Sync completed with errors'
              : `Syncing ${status.sync.source ?? 'sources'}`
          }
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            syncOutcome
              ? 100
              : Math.round(
                  ((status.sync.sourceIndex + status.sync.done / Math.max(status.sync.total, 1)) /
                    Math.max(status.sync.sourceTotal, 1)) *
                    100,
                )
          }
        >
          {status.sources.map((source, index) => {
            const active = status.sync.source === source.id
            const complete = !active && index < status.sync.sourceIndex
            const percent = syncOutcome
              ? 100
              : active
                ? Math.round((status.sync.done / Math.max(status.sync.total, 1)) * 100)
                : complete
                  ? 100
                  : 0
            return (
              <span
                key={source.id}
                className={`seg${active && !syncOutcome ? ' active' : ''}`}
                title={active ? `${source.id} ${status.sync.done}/${status.sync.total}` : source.id}
              >
                <i style={{ width: `${percent}%` }} />
              </span>
            )
          })}
        </div>
      )}

      {note && (
        <p className={`note ${note.tone}`} role="status" aria-live="polite">
          {note.text}
        </p>
      )}

      {today && settings && (
        <section className="today enter-item" style={{ '--i': 1 } as React.CSSProperties}>
          <span className="today-label">Today</span>
          {today.events.length === 0 && (
            <span className="event free">
              {settings.calendarConnected ? 'No events today' : 'Calendar not connected'}
            </span>
          )}
          {today.events.map((event) => (
            <span key={event.id} className="event">
              <b>
                {new Date(event.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </b>{' '}
              {event.summary}
            </span>
          ))}
          {today.conflicts.length > 0 && (
            <span className="event conflict">Conflict: {today.conflicts.join(', ')}</span>
          )}
          {today.free.slice(0, 2).map((window) => (
            <span key={window.from} className="event free">
              Free {time(window.from)}–{time(window.to)}
            </span>
          ))}
        </section>
      )}

      <form className="search enter-item" style={{ '--i': 2 } as React.CSSProperties} onSubmit={(event) => void search(event)}>
        <div className="search-wrap">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search notes, mail and Drive…"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={items.length > 0}
          />
          {items.length > 0 && (
            <div className="suggest" role="listbox">
              {items.map((item, index) => (
                <Fragment key={`${item.kind}-${index}`}>
                  {(index === 0 || items[index - 1]!.kind !== item.kind) && (
                    <div className="group">
                      {item.kind === 'note' ? 'Notes' : item.kind === 'mail' ? 'Mail' : 'Drive'}
                    </div>
                  )}
                  <div
                    role="option"
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
        <button type="submit" className="ghost">Search</button>
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
        <section className="card results">
          <h2>Results for “{resultsQuery}”</h2>
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

      <section className={`card briefing enter-item${glow ? ' glow' : ''}`} style={{ '--i': 3 } as React.CSSProperties}>
        <div className="card-head">
          <h2>Briefing</h2>
          <button className="primary" onClick={() => void generate()} disabled={busy}>
            {busy ? 'Thinking…' : 'Briefing now'}
          </button>
        </div>
        {busy ? (
          <div className="skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : latest ? (
          <>
            <p className="sub">
              {new Date(latest.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <div className="markdown">
              {latest.markdown.split('\n').map((line, index) => (
                <span
                  className="md-line"
                  key={`${latest.id}-${index}`}
                  style={{ '--i': Math.min(index, 12) } as React.CSSProperties}
                >
                  {line || '\u00A0'}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="empty">No briefing yet. Generate one whenever you are ready.</p>
        )}
        {latest && status && !status.briefingToday && (
          <p className="empty">No briefing for today yet — showing the last one.</p>
        )}
        {briefings.length > 1 && (
          <details className="earlier">
            <summary>Earlier briefings</summary>
            {briefings.slice(1).map((briefing) => (
              <article key={briefing.id}>
                <h3>{new Date(briefing.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</h3>
                <div className="markdown">{briefing.markdown}</div>
              </article>
            ))}
          </details>
        )}
      </section>

      <div className="columns enter-item" style={{ '--i': 4 } as React.CSSProperties}>
        <section className="card">
          <h2>Activity</h2>
          {feed.length === 0 && <p className="empty">No changes yet.</p>}
          {feed.map((day) => {
            const expanded = expandedDays.includes(day.date)
            const visible = expanded ? day.items : day.items.slice(0, 6)
            const hidden = day.items.length - visible.length
            return (
              <div key={day.date} className="day">
                <h3>{dayLabel(day.date)}</h3>
                <ul>
                  {visible.map((item, index) => (
                    <li key={`${day.date}-${index}`}>
                      <span className={`dot ${item.source}`} />
                      {item.source === 'vault' && item.id ? (
                        <button
                          className="link"
                          aria-expanded={openDiff?.id === item.id}
                          aria-controls={`diff-${item.id}`}
                          onClick={() => void toggleDiff(item.id!)}
                        >
                          {item.label}
                        </button>
                      ) : (
                        <span className="label">{item.label}</span>
                      )}
                      <span className="detail">
                        {item.source === 'vault' && item.added !== undefined ? (
                          <>
                            <span className="added">+{item.added}</span>
                            {' / '}
                            <span className="removed">-{item.removed ?? 0}</span>
                          </>
                        ) : (
                          item.detail
                        )}
                      </span>
                      {openDiff && openDiff.id === item.id && (
                        <div className="diff-wrap" id={`diff-${item.id}`}>
                          <pre className="diff">{openDiff.diff || 'No line changes'}</pre>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {hidden > 0 && (
                  <button
                    type="button"
                    className="ghost mini day-more"
                    onClick={() => setExpandedDays((current) => [...current, day.date])}
                  >
                    Show {hidden} more
                  </button>
                )}
              </div>
            )
          })}
        </section>

        <section className="card">
          <h2>Needs attention</h2>
          {attention.length === 0 && <p className="empty">Nothing needs attention.</p>}
          <ul className="attention">
            {attention.map((item, index) => {
              const href = attentionHref(item)
              return (
                <li key={`${item.kind}-${index}`}>
                  <span className={`kind ${item.kind}`}>{item.kind.replace('-', ' ')}</span>
                  {href ? (
                    <a
                      className="label"
                      href={href}
                      target={href.startsWith('obsidian://') ? undefined : '_blank'}
                      rel={href.startsWith('obsidian://') ? undefined : 'noreferrer'}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <span className="label">{item.label}</span>
                  )}
                  {item.count && item.count > 1 && <span className="count">×{item.count}</span>}
                  <span className="detail">{item.detail}</span>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
