import type { DatabaseSync } from 'node:sqlite'
import { getSetting } from './db/index.js'

export type Retention = {
  mailBodyDays: number
  browserDays: number
  vaultChangeDays: number
}

export const RETENTION_DEFAULTS: Retention = {
  mailBodyDays: 90,
  browserDays: 90,
  vaultChangeDays: 365,
}

function days(db: DatabaseSync, key: string, fallback: number): number {
  const raw = getSetting(db, key)
  const value = Number(raw)
  return raw !== null && Number.isFinite(value) && value >= 1 && value <= 3650
    ? Math.round(value)
    : fallback
}

export function retention(db: DatabaseSync): Retention {
  return {
    mailBodyDays: days(db, 'mail_body_days', RETENTION_DEFAULTS.mailBodyDays),
    browserDays: days(db, 'browser_days', RETENTION_DEFAULTS.browserDays),
    vaultChangeDays: days(db, 'vault_change_days', RETENTION_DEFAULTS.vaultChangeDays),
  }
}

/** Old bodies become headers-only; old visits and diffs leave the database entirely. */
export function applyRetention(db: DatabaseSync, now = new Date()): void {
  const { mailBodyDays, browserDays, vaultChangeDays } = retention(db)
  const mailCutoff = new Date(now.getTime() - mailBodyDays * 86_400_000).toISOString()
  const browserCutoff = new Date(now.getTime() - browserDays * 86_400_000).toISOString()
  const vaultCutoff = new Date(now.getTime() - vaultChangeDays * 86_400_000).toISOString()

  db.prepare(
    `UPDATE mail_messages SET body = NULL, snippet = ''
     WHERE date < ? AND (body IS NOT NULL OR snippet != '')`,
  ).run(mailCutoff)
  db.prepare('DELETE FROM browser_visits WHERE visited_at < ?').run(browserCutoff)
  db.prepare('DELETE FROM vault_changes WHERE detected_at < ?').run(vaultCutoff)
}
