import { expect, test } from 'vitest'
import { openDb } from '../src/server/db/index.js'
import { createWeatherSource, type WeatherApi, type WeatherDay } from '../src/server/sources/weather.js'

const today = new Date().toLocaleDateString('en-CA')
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA')

function day(overrides: Partial<WeatherDay> = {}): WeatherDay {
  return {
    date: today,
    min: 12,
    max: 18,
    precipitation: 60,
    code: 61,
    ...overrides,
  }
}

function fakeApi(days: WeatherDay[]): WeatherApi {
  return { daily: async () => days }
}

test('stores today and tomorrow and names the weather in the digest', async () => {
  const db = openDb(':memory:')
  const source = createWeatherSource(fakeApi([day(), day({ date: tomorrow, code: 0 })]))
  await source.sync(db)

  expect(db.prepare('SELECT COUNT(*) AS n FROM weather_daily').get()).toEqual({ n: 2 })
  const digest = source.digest(db, new Date()).join('\n')
  expect(digest).toContain('12–18°C')
  expect(digest).toContain('light rain')
  expect(digest).toContain('60%')
})

test('an unconfigured weather source is inert', async () => {
  const db = openDb(':memory:')
  const source = createWeatherSource(null)
  expect(source.configured()).toBe(false)
  await expect(source.sync(db)).resolves.toBeUndefined()
  expect(source.digest(db, new Date())).toEqual([])
})
