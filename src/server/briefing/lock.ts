/**
 * One paid generation at a time across the scheduler and the HTTP route. Without this a startup
 * catch-up and a manual click can both call DeepSeek and insert two briefings.
 */
let busy = false

export function claimBriefing(): boolean {
  if (busy) return false
  busy = true
  return true
}

export function releaseBriefing(): void {
  busy = false
}
