import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from '../db/index.js'
import { sourceMeta, type Source, type SourceMeta } from './types.js'

export type WeatherDay = {
  date: string
  min: number
  max: number
  precipitation: number
  code: number
}

export type WeatherApi = {
  daily(latitude: number, longitude: number): Promise<WeatherDay[]>
}

const WEATHER_TEXT: Array<[number[], string]> = [
  [[0], 'clear'],
  [[1, 2], 'partly cloudy'],
  [[3], 'overcast'],
  [[45, 48], 'fog'],
  [[51, 53, 55, 56, 57], 'drizzle'],
  [[61, 66], 'light rain'],
  [[63, 65, 67], 'rain'],
  [[71, 73, 75, 77], 'snow'],
  [[80, 81, 82], 'showers'],
  [[85, 86], 'snow showers'],
  [[95, 96, 99], 'thunderstorm'],
]

export function weatherText(code: number): string {
  for (const [codes, label] of WEATHER_TEXT) {
    if (codes.includes(code)) return label
  }
  return 'unknown'
}

function localDate(now = new Date()): string {
  return now.toLocaleDateString('en-CA')
}

export function createWeatherSource(
  api: WeatherApi | null,
  meta: SourceMeta = sourceMeta('weather', 'weather'),
): Source {
  const connectionId = meta.connectionId
  const syncKey = `last_sync_weather:${connectionId}`
  return {
    ...meta,
    configured: () => api !== null,
    async sync(db, now = new Date()) {
      if (!api) return
      const days = await api.daily(0, 0)
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM weather_daily WHERE connection_id = ?').run(connectionId)
        const insert = db.prepare(
          `INSERT INTO weather_daily (connection_id, date, min, max, precipitation, code, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        for (const day of days.slice(0, 2)) {
          insert.run(
            connectionId,
            day.date,
            day.min,
            day.max,
            Math.round(day.precipitation),
            day.code,
            now.toISOString(),
          )
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      setSetting(db, syncKey, now.toISOString())
    },
    lastSync: (db) => getSetting(db, syncKey),
    digest: (db, _since) => {
      const row = db
        .prepare(
          'SELECT min, max, precipitation, code FROM weather_daily WHERE connection_id = ? AND date = ?',
        )
        .get(connectionId, localDate()) as
        | { min: number; max: number; precipitation: number; code: number }
        | undefined
      if (!row) return []
      return [
        `Weather: ${Math.round(row.min)}–${Math.round(row.max)}°C, ${weatherText(row.code)} (${row.precipitation}%)`,
      ]
    },
  }
}

export function createOpenMeteoApi(config: Record<string, string> | null): WeatherApi | null {
  const latitude = Number(config?.latitude)
  const longitude = Number(config?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  return {
    async daily(lat, lon) {
      const params = new URLSearchParams({
        latitude: String(lat || latitude),
        longitude: String(lon || longitude),
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
        timezone: 'auto',
        forecast_days: '2',
      })
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
      if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`)
      const data = (await response.json()) as {
        daily?: {
          time?: string[]
          temperature_2m_max?: number[]
          temperature_2m_min?: number[]
          precipitation_probability_max?: number[]
          weather_code?: number[]
        }
      }
      const daily = data.daily
      if (!daily?.time) return []
      return daily.time.flatMap((date, index) => {
        const min = daily.temperature_2m_min?.[index]
        const max = daily.temperature_2m_max?.[index]
        if (typeof min !== 'number' || typeof max !== 'number') return []
        return [
          {
            date,
            min,
            max,
            precipitation: daily.precipitation_probability_max?.[index] ?? 0,
            code: daily.weather_code?.[index] ?? 0,
          },
        ]
      })
    },
  }
}
