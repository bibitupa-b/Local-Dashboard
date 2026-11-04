export function shouldCatchUp(lastBriefingAt: Date | null, now: Date, hour: number): boolean {
  if (!lastBriefingAt) return true
  const isToday = lastBriefingAt.toDateString() === now.toDateString()
  return !isToday && now.getHours() >= hour
}

/** Monday-based, in local time, so "this week" means the week the person is living in. */
function weekStart(date: Date): number {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday.getTime()
}

export function isWeeklyDue(lastAt: Date | null, now: Date): boolean {
  return lastAt === null || weekStart(lastAt) !== weekStart(now)
}
