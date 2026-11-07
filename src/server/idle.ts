import type { AttentionItem } from './attention.js'

/** Backoff for an IDLE reconnect: doubles each attempt, capped at five minutes. */
export function nextIdleDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 300_000)
}

/** A stable key for dedup: the message id when there is one, else kind + label (reply counts). */
function notificationKey(item: AttentionItem): string {
  return item.messageId ?? `${item.kind}:${item.label}`
}

/**
 * Mail/reply attention items that are new since `before` and not already notified (`seen`).
 * `before` stops the first IDLE event from re-announcing mail that was already unread; `seen`
 * (persisted across events) stops the same message from notifying twice.
 */
export function newMailNotifications(
  before: AttentionItem[],
  after: AttentionItem[],
  seen: Set<string>,
): AttentionItem[] {
  const known = new Set<string>(seen)
  for (const item of before) known.add(notificationKey(item))
  return after.filter(
    (item) =>
      (item.kind === 'mail' || item.kind === 'reply') && !known.has(notificationKey(item)),
  )
}
