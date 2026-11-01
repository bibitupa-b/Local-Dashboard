import { useState } from 'react'
import { api, type Settings } from './api.js'

const SOURCES = ['vault', 'drive', 'mail', 'calendar', 'browser', 'github'] as const

export function SettingsPanel({
  settings,
  onSaved,
}: {
  settings: Settings
  onSaved: (next: Settings) => void
}) {
  const [vaultPath, setVaultPath] = useState(settings.vaultPath)
  const [briefingHour, setBriefingHour] = useState(settings.briefingHour)
  const [senders, setSenders] = useState(settings.excludedSenders.join('\n'))
  const [vaultPrefixes, setVaultPrefixes] = useState(settings.excludedVaultPrefixes.join('\n'))
  const [browserDomains, setBrowserDomains] = useState(settings.excludedBrowserDomains.join('\n'))
  const [windowHours, setWindowHours] = useState(settings.digestWindowHours)
  const [enabled, setEnabled] = useState<string[]>(
    settings.enabledSources.length > 0 ? settings.enabledSources : [...SOURCES],
  )

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const next = {
      ...settings,
      vaultPath,
      briefingHour,
      excludedSenders: lines(senders),
      excludedVaultPrefixes: lines(vaultPrefixes),
      excludedBrowserDomains: lines(browserDomains),
      digestWindowHours: windowHours,
      enabledSources: enabled,
    }
    await api.saveSettings({
      vaultPath,
      briefingHour,
      excludedSenders: next.excludedSenders,
      excludedVaultPrefixes: next.excludedVaultPrefixes,
      excludedBrowserDomains: lines(browserDomains),
      digestWindowHours: windowHours,
      enabledSources: enabled,
    })
    onSaved(next)
  }

  return (
    <form className="card settings" onSubmit={(event) => void save(event)}>
      <h2>Settings</h2>
      <label>
        Vault path
        <input value={vaultPath} onChange={(event) => setVaultPath(event.target.value)} />
      </label>
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
        {SOURCES.map((source) => (
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
            {source}
          </label>
        ))}
      </fieldset>
      <p className="detail">
        DeepSeek key: {settings.hasDeepSeekKey ? 'configured' : 'missing in .env'} · Drive:{' '}
        {settings.driveConnected ? 'connected' : settings.googleConfigured ? 'not connected' : 'credentials missing'} · Mail:{' '}
        {settings.mailConnected ? 'synced' : settings.mailConfigured ? 'not synced' : 'missing in .env'} · Calendar:{' '}
        {settings.calendarConnected ? 'connected' : 'not connected'} · Browser:{' '}
        {settings.browserConfigured ? 'connected' : 'history not found'} · GitHub:{' '}
        {settings.githubConnected ? 'synced' : settings.githubConfigured ? 'not synced' : 'missing in .env'}
      </p>
      <div className="row">
        <button type="submit">Save</button>
        {settings.googleConfigured && (!settings.driveConnected || !settings.calendarConnected) && (
          <a className="ghost" href="/api/oauth/google/start">
            {settings.driveConnected ? 'Grant calendar access' : 'Connect Google Drive & Calendar'}
          </a>
        )}
      </div>
    </form>
  )
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
