import { Fragment, useEffect, useState } from 'react'
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
import { driveUrl, mailUrl, obsidianUrl, sourceUrl } from './links.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [feed, setFeed] = useState<FeedDay[]>([])
  const [attention, setAttention] = useState<AttentionItem[]>([])
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [today, setToday] = useState<Today | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [resultsQuery, setResultsQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResults | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [openDiff, setOpenDiff] = useState<{ id: number; path: string; diff: string } | null>(null)

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
      setNote(error instanceof Error ? error.message : 'Backend is not reachable')
    }
  }

  useEffect(() => {
    const drive = new URLSearchParams(window.location.search).get('drive')
    if (drive === 'connected') setNote('Google connected. Sources are syncing now.')
    else if (drive === 'error') setNote('Google authorization failed. Try connecting again from Settings.')
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

  async function generate() {
    setBusy(true)
    setNote(null)
    try {
      const result = await api.generate()
      if ('error' in result) {
        setNote(
          result.error === 'no-key'
            ? 'Add DEEPSEEK_API_KEY to .env and restart the server.'
            : `Briefing failed: ${result.error}`,
        )
      } else {
        setBriefings((items) => [
          { id: Date.now(), created_at: new Date().toISOString(), trigger: 'manual', markdown: result.markdown },
          ...items,
        ])
        setStatus((current) => (current ? { ...current, briefingToday: true } : current))
      }
    } catch (error) {
      setNote(error instanceof Error ? `Briefing failed: ${error.message}` : 'Briefing failed')
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
    setResults(await api.search(term))
    setResultsQuery(term)
    setSuggestions(null)
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
    setOpenDiff({ id, ...(await api.vaultChange(id)) })
  }

  const latest = briefings[0]

  if (showSettings && settings) {
    return (
      <div className="page">
        <SettingsPanel
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(next) => {
            setSettings(next)
            setNote('Preferences saved.')
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
    <div className="page">
      <header className="head">
        <div>
          <h1>Local Dashboard</h1>
          <p className="sub">
            {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="status">
          {statusGroups.map((group) => {
            const url = sourceUrl(group.service, vaultPath)
            const className = `pill ${group.configured > 0 ? 'ok' : 'off'}${group.error ? ' bad' : ''}`
            const title = group.error ?? `${group.configured}/${group.total} connected`
            const label = (
              <>
                {group.service}
                {group.total > 1 ? ` · ${group.total}` : ''}
                {group.lastSync ? ` · ${time(group.lastSync)}` : group.configured > 0 ? '' : ' · not connected'}
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
          <button
            className="ghost"
            onClick={() => {
              void api.sync().then(load)
            }}
          >
            Sync
          </button>
          <button className="ghost" onClick={() => setShowSettings((value) => !value)}>
            Settings
          </button>
        </div>
      </header>

      {status?.sync.running && (
        <div className="syncbar" role="progressbar" aria-label="Syncing sources">
          {status.sources.map((source, index) => {
            const active = status.sync.source === source.id
            const complete = !active && index < status.sync.sourceIndex
            const percent = active
              ? Math.round((status.sync.done / Math.max(status.sync.total, 1)) * 100)
              : complete
                ? 100
                : 0
            return (
              <span
                key={source.id}
                className={`seg${active ? ' active' : ''}`}
                title={active ? `${source.id} ${status.sync.done}/${status.sync.total}` : source.id}
              >
                <i style={{ width: `${percent}%` }} />
              </span>
            )
          })}
        </div>
      )}

      {note && <p className="note">{note}</p>}

      {today && today.events.length > 0 && (
        <section className="today">
          <span className="today-label">Today</span>
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

      <form className="search" onSubmit={(event) => void search(event)}>
        <div className="search-wrap">
          <input
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
        <button type="submit">Search</button>
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

      <section className="card briefing">
        <div className="card-head">
          <h2>Briefing</h2>
          <button onClick={() => void generate()} disabled={busy}>
            {busy ? 'Thinking…' : 'Briefing now'}
          </button>
        </div>
        {latest ? (
          <>
            <p className="sub">
              {new Date(latest.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <div className="markdown">{latest.markdown}</div>
          </>
        ) : (
          <p className="empty">No briefing yet. Generate one whenever you are ready.</p>
        )}
        {latest && status && !status.briefingToday && (
          <p className="empty">No briefing for today yet.</p>
        )}
        {briefings.length > 1 && (
          <details className="earlier">
            <summary>Earlier briefings</summary>
            {briefings.slice(1).map((briefing) => (
              <article key={briefing.id}>
                <h3>{new Date(briefing.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</h3>
                <div className="markdown">{briefing.markdown}</div>
              </article>
            ))}
          </details>
        )}
      </section>

      <div className="columns">
        <section className="card">
          <h2>Activity</h2>
          {feed.length === 0 && <p className="empty">No changes yet.</p>}
          {feed.map((day) => (
            <div key={day.date} className="day">
              <h3>{dayLabel(day.date)}</h3>
              <ul>
                {day.items.map((item, index) => (
                  <li key={`${day.date}-${index}`}>
                    <span className={`dot ${item.source}`} />
                    {item.source === 'vault' && item.id ? (
                      <button className="link" onClick={() => void toggleDiff(item.id!)}>
                        {item.label}
                      </button>
                    ) : (
                      <span className="label">{item.label}</span>
                    )}
                    <span className="detail">{item.detail}</span>
                    {openDiff && openDiff.id === item.id && (
                      <pre className="diff">{openDiff.diff || 'No line changes'}</pre>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Needs attention</h2>
          {attention.length === 0 && <p className="empty">Nothing needs attention.</p>}
          <ul className="attention">
            {attention.map((item, index) => (
              <li key={`${item.kind}-${index}`}>
                <span className={`kind ${item.kind}`}>{item.kind.replace('-', ' ')}</span>
                <span className="label">{item.label}</span>
                {item.count && item.count > 1 && <span className="count">×{item.count}</span>}
                <span className="detail">{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
