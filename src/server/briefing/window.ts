/**
 * The digest window is a setting, not the remainder since the last briefing: a second
 * "Briefing now" five minutes later must still cover the full window.
 */
export function digestWindowStart(lastAt: Date | null, now: Date, hours: number): Date {
  const floor = now.getTime() - hours * 3_600_000
  return new Date(Math.min(lastAt?.getTime() ?? Infinity, floor))
}
