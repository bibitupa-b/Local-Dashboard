import type { DatabaseSync } from 'node:sqlite'
import nodemailer from 'nodemailer'
import type { SecretBox } from './secrets.js'
import { listConnections, markConnectionSync } from './connections.js'
import { isLocalOnly } from './settings.js'

export type DeliveryResult = {
  connectionId: string
  service: 'smtp' | 'telegram'
  ok: boolean
  error?: string
}

export type SmtpSender = (input: {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
  to: string
  subject: string
  text: string
}) => Promise<void>

export type TelegramSender = (input: {
  token: string
  chatId: string
  text: string
}) => Promise<void>

export type DeliveryDeps = {
  smtp?: SmtpSender
  telegram?: TelegramSender
}

const TIMEOUT_MS = 20_000

/** A sender that never answers must not leave a dangling delivery promise. */
function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

const defaultSmtpSender: SmtpSender = async (input) => {
  const transport = nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure: input.secure,
    // Non-465 ports must upgrade with STARTTLS; never fall back to plaintext.
    requireTLS: !input.secure,
    auth: { user: input.user, pass: input.password },
  })
  await transport.sendMail({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  })
}

const defaultTelegramSender: TelegramSender = async (input) => {
  const res = await fetch(`https://api.telegram.org/bot${input.token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) throw new Error(`Telegram responded ${res.status}`)
}

/**
 * Sends a saved briefing to every enabled SMTP and Telegram connection. A failing channel never
 * blocks another or throws; each outcome is returned and the error is logged by connection id only.
 * Delivery is fire-and-forget from the briefing path, so the whole call must resolve, never reject.
 */
export async function deliverBriefing(
  db: DatabaseSync,
  box: SecretBox,
  briefing: { id: number; markdown: string; body: { headline: string } },
  kind: string,
  deps: DeliveryDeps = {},
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = []
  try {
    if (isLocalOnly(db)) return []

    const subject = `Local Dashboard - ${briefing.body.headline}`

    for (const connection of listConnections(db, box)) {
      if (!connection.enabled) continue
      if (connection.service !== 'smtp' && connection.service !== 'telegram') continue
      try {
        if (connection.service === 'smtp') {
          const send = deps.smtp ?? defaultSmtpSender
          await withTimeout(
            send({
              host: connection.config.host ?? '',
              port: Number(connection.config.port),
              secure: connection.config.port === '465',
              user: connection.secret?.user ?? '',
              password: connection.secret?.password ?? '',
              from: connection.config.from ?? '',
              to: connection.config.to ?? '',
              subject,
              text: briefing.markdown,
            }),
            `smtp ${connection.id}`,
          )
        } else {
          const send = deps.telegram ?? defaultTelegramSender
          await withTimeout(
            send({
              token: connection.secret?.botToken ?? '',
              chatId: connection.config.chatId ?? '',
              text: briefing.markdown,
            }),
            `telegram ${connection.id}`,
          )
        }
        results.push({ connectionId: connection.id, service: connection.service, ok: true })
        markConnectionSync(db, connection.id, null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Never log secrets or message bodies: only the connection id and the error message.
        console.error(`[delivery] ${connection.id}: ${message}`)
        markConnectionSync(db, connection.id, message)
        results.push({
          connectionId: connection.id,
          service: connection.service,
          ok: false,
          error: message,
        })
      }
    }
  } catch (error) {
    // A read failure before or between channels must not reject the fire-and-forget call.
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[delivery] ${message}`)
  }
  return results
}
