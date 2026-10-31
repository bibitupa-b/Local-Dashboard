import { useState } from 'react'
import { api, type Settings } from './api.js'

export function SettingsPanel({
  settings,
  onSaved,
}: {
  settings: Settings
  onSaved: (next: Settings) => void
}) {
  const [vaultPath, setVaultPath] = useState(settings.vaultPath)
  const [briefingHour, setBriefingHour] = useState(settings.briefingHour)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    await api.saveSettings({ vaultPath, briefingHour })
    onSaved({ ...settings, vaultPath, briefingHour })
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
      <p className="detail">
        DeepSeek key: {settings.hasDeepSeekKey ? 'configured' : 'missing in .env'} · Drive:{' '}
        {settings.driveConnected ? 'connected' : settings.googleConfigured ? 'not connected' : 'credentials missing'} · Mail:{' '}
        {settings.mailConnected ? 'synced' : settings.mailConfigured ? 'not synced' : 'missing in .env'} · Calendar:{' '}
        {settings.calendarConnected ? 'connected' : 'not connected'}
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
