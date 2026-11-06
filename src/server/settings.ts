import type { DatabaseSync } from 'node:sqlite'
import { getSetting, setSetting } from './db/index.js'
import { WALLPAPER_IDS as SHARED_WALLPAPER_IDS, type WallpaperId } from '../shared/wallpaper-ids.js'
import {
  normalizeWidgetLayout,
  type WidgetLayout,
} from '../shared/widgets.js'

export const LIST_KEYS = {
  mailSenders: 'mail_excluded_senders',
  mailFolders: 'mail_excluded_folders',
  vaultPrefixes: 'vault_excluded_prefixes',
  browserDomains: 'browser_excluded_domains',
} as const

export function getList(db: DatabaseSync, key: string): string[] {
  return (getSetting(db, key) ?? '')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
}

export function setList(db: DatabaseSync, key: string, values: string[]): void {
  setSetting(
    db,
    key,
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n'),
  )
}

export function isExcludedSender(db: DatabaseSync, sender: string): boolean {
  const haystack = sender.toLowerCase()
  return getList(db, LIST_KEYS.mailSenders).some((pattern) => haystack.includes(pattern))
}

export function isExcludedFolder(db: DatabaseSync, path: string): boolean {
  return getList(db, LIST_KEYS.mailFolders).some((pattern) => path.toLowerCase().includes(pattern))
}

export function isExcludedVaultPath(db: DatabaseSync, path: string): boolean {
  const haystack = path.replace(/\\/g, '/').toLowerCase()
  return getList(db, LIST_KEYS.vaultPrefixes).some((prefix) =>
    haystack.startsWith(prefix.replace(/\\/g, '/').replace(/^\/+/, '')),
  )
}

/** Accepts absolute Windows paths, backslashes and stray slashes; stores vault-relative prefixes. */
export function normalizeVaultPrefixes(values: string[], vaultPath: string): string[] {
  const root = vaultPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return values
    .map((value) => value.replace(/\\/g, '/').trim().toLowerCase())
    .map((value) => (value.startsWith(root) ? value.slice(root.length) : value))
    .map((value) => value.replace(/^\/+/, ''))
    .map((value) => value.replace(/\/+$/, ''))
    .filter(Boolean)
}

export type BriefingLanguage = 'auto' | 'ru' | 'en'

export function briefingLanguage(db: DatabaseSync): BriefingLanguage {
  const value = getSetting(db, 'briefing_language')
  return value === 'ru' || value === 'en' ? value : 'auto'
}

export function digestWindowHours(db: DatabaseSync): number {
  const value = Number(getSetting(db, 'digest_window_hours'))
  return value > 0 ? value : 24
}

export const MAX_PROFILE_CHARS = 500

export function briefingProfile(db: DatabaseSync): string {
  return (getSetting(db, 'briefing_profile') ?? '').slice(0, MAX_PROFILE_CHARS)
}

export const WALLPAPER_IDS = SHARED_WALLPAPER_IDS

export type Wallpaper = WallpaperId

/** Unknown or missing values fall back to the aurora, never to an arbitrary path. */
export function wallpaper(db: DatabaseSync): Wallpaper {
  const value = getSetting(db, 'wallpaper')
  return WALLPAPER_IDS.includes(value as Wallpaper) ? (value as Wallpaper) : 'aurora'
}

export type MotionPreset = 'calm' | 'balanced' | 'lively'

export type Appearance = {
  blur: number
  glass: number
  grain: number
  shadow: number
  photo: number
  motion: MotionPreset
  accent: number | null
}

export const APPEARANCE_DEFAULTS: Appearance = {
  blur: 14,
  glass: 100,
  grain: 12,
  shadow: 100,
  photo: 94,
  motion: 'balanced',
  accent: null,
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

const MOTIONS: MotionPreset[] = ['calm', 'balanced', 'lively']

function readNumber(db: DatabaseSync, key: string, min: number, max: number, fallback: number): number {
  const raw = getSetting(db, key)
  if (raw === undefined || raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? clamp(value, min, max) : fallback
}

/** The appearance knobs, already clamped so the interface can trust every value. */
export function appearance(db: DatabaseSync): Appearance {
  const motion = getSetting(db, 'appearance_motion')
  const accent = readNumber(db, 'appearance_accent', -1, 359, -1)
  return {
    blur: readNumber(db, 'appearance_blur', 0, 30, APPEARANCE_DEFAULTS.blur),
    glass: readNumber(db, 'appearance_glass', 60, 150, APPEARANCE_DEFAULTS.glass),
    grain: readNumber(db, 'appearance_grain', 0, 20, APPEARANCE_DEFAULTS.grain),
    shadow: readNumber(db, 'appearance_shadow', 0, 100, APPEARANCE_DEFAULTS.shadow),
    photo: readNumber(db, 'appearance_photo', 70, 100, APPEARANCE_DEFAULTS.photo),
    motion: MOTIONS.includes(motion as MotionPreset) ? (motion as MotionPreset) : 'balanced',
    accent: accent < 0 ? null : accent,
  }
}

export function setAppearance(db: DatabaseSync, patch: Partial<Appearance>): void {
  const limits: Array<[keyof Appearance, number, number]> = [
    ['blur', 0, 30],
    ['glass', 60, 150],
    ['grain', 0, 20],
    ['shadow', 0, 100],
    ['photo', 70, 100],
  ]
  for (const [key, min, max] of limits) {
    const value = patch[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      setSetting(db, `appearance_${key}`, String(clamp(value, min, max)))
    }
  }
  if (patch.motion && MOTIONS.includes(patch.motion)) {
    setSetting(db, 'appearance_motion', patch.motion)
  }
  if (patch.accent === null) setSetting(db, 'appearance_accent', '')
  else if (typeof patch.accent === 'number' && Number.isFinite(patch.accent)) {
    setSetting(db, 'appearance_accent', String(clamp(patch.accent, 0, 359)))
  }
}

/** The widget slots, clamped so an old or edited value can never break the grid. */
export function widgetLayout(db: DatabaseSync): WidgetLayout[] {
  const raw = getSetting(db, 'widget_layout')
  if (!raw) return normalizeWidgetLayout(null)
  try {
    return normalizeWidgetLayout(JSON.parse(raw))
  } catch {
    return normalizeWidgetLayout(null)
  }
}

export function setWidgetLayout(db: DatabaseSync, value: unknown): void {
  setSetting(db, 'widget_layout', JSON.stringify(normalizeWidgetLayout(value)))
}

/** Strict grounding is on unless the person turned it off. */
export function groundingStrict(db: DatabaseSync): boolean {
  return getSetting(db, 'grounding_strict') !== '0'
}

export function isSourceEnabled(db: DatabaseSync, id: string): boolean {
  const enabled = getList(db, 'enabled_sources')
  return enabled.length === 0 || enabled.includes(id.toLowerCase())
}
