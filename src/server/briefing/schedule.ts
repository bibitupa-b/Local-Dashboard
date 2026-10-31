export function shouldCatchUp(lastBriefingAt: Date | null, now: Date, hour: number): boolean {
  if (!lastBriefingAt) return true
  const isToday = lastBriefingAt.toDateString() === now.toDateString()
  return !isToday && now.getHours() >= hour
}
