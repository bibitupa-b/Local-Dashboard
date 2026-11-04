import type { DatabaseSync } from 'node:sqlite'

const WEEK_MS = 7 * 86_400_000

/**
 * Four pairs of counts for the weekly review — the seven days up to `now` and the seven before them —
 * plus two lines on what has not moved in three weeks. Returned as digest lines, so the digest itself
 * stays a pure function of its input.
 */
export function weeklyCounts(db: DatabaseSync, now: Date): string {
  const currentFrom = new Date(now.getTime() - WEEK_MS)
  const previousFrom = new Date(now.getTime() - 2 * WEEK_MS)

  function pair(table: string, column: string, extra = ''): [number, number] {
    const sql = `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} >= ? AND ${column} < ?${extra}`
    const read = (from: Date, to: Date) =>
      (db.prepare(sql).get(from.toISOString(), to.toISOString()) as { n: number }).n
    return [read(currentFrom, now), read(previousFrom, currentFrom)]
  }

  const pairs: Array<[string, [number, number]]> = [
    ['Notes touched', pair('vault_changes', 'detected_at')],
    ['Tasks closed', pair('tasks', 'last_seen', ' AND done = 1')],
    ['Mail arrived', pair('mail_messages', 'date')],
    ['Events passed', pair('calendar_events', 'start')],
  ]
  const staleBefore = new Date(now.getTime() - 3 * WEEK_MS).toISOString()
  const stale = (sql: string): number => (db.prepare(sql).get(staleBefore) as { n: number }).n
  return [
    ...pairs.map(
      ([label, [thisWeek, lastWeek]]) => `${label}: ${thisWeek} this week, ${lastWeek} last`,
    ),
    `Notes untouched 3+ weeks: ${stale('SELECT COUNT(*) AS n FROM vault_files WHERE mtime < ?')}`,
    `Tasks open 3+ weeks: ${stale('SELECT COUNT(*) AS n FROM tasks WHERE done = 0 AND first_seen < ?')}`,
  ].join('\n')
}
