import { useEffect, useState } from 'react'
import { api, type AttentionItem, type Briefing, type FeedDay, type Settings, type Status } from './api.js'
import { SettingsPanel } from './Settings.js'

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
  const [settings, setSettings] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  async function load() {
    try {
      const [nextStatus, nextFeed, nextAttention, nextBriefings, nextSettings] = await Promise.all([
        api.status(),
        api.feed(),
        api.attention(),
        api.briefings(),
        api.settings(),
      ])
      setStatus(nextStatus)
      setFeed(nextFeed.days)
      setAttention(nextAttention)
      setBriefings(nextBriefings.items)
      setSettings(nextSettings)
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Backend is not reachable')
    }
  }

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 60_000)
    return () => clearInterval(timer)
  }, [])

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

  const latest = briefings[0]

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
          {status?.sources.map((source) => (
            <span key={source.id} className={source.configured ? 'pill ok' : 'pill off'}>
              {source.id}
              {source.configured ? (source.lastSync ? ` · ${time(source.lastSync)}` : '') : ' · not connected'}
            </span>
          ))}
          <button className="ghost" onClick={() => setShowSettings((value) => !value)}>
            Settings
          </button>
        </div>
      </header>

      {note && <p className="note">{note}</p>}

      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          onSaved={(next) => {
            setSettings(next)
            setNote('Saved. Restart the server to apply a new vault path.')
          }}
        />
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
                    <span className="label">{item.label}</span>
                    <span className="detail">{item.detail}</span>
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
