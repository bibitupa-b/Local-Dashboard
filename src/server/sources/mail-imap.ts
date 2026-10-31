import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { Config } from '../config.js'
import type { MailApi, MailFlags, MailMessage } from './mail.js'

const BODY_DAYS = 90
const INITIAL_LIMIT = 500
const BODY_LIMIT = 200
const FLAG_WINDOW = 200
const BODY_MAX_CHARS = 100_000

type Envelope = {
  subject?: string
  messageId?: string
  date?: Date
  from?: Array<{ name?: string; address?: string }>
}
type RawMessage = {
  uid: number
  envelope?: Envelope
  flags?: Set<string>
  internalDate?: Date
  source?: Buffer
}

function senderOf(envelope: Envelope | undefined): string {
  const from = envelope?.from?.[0]
  if (!from?.address) return 'unknown'
  return from.name ? `${from.name} <${from.address}>` : from.address
}

export function createImapMailApi(config: Config): MailApi | null {
  if (!config.gmailUser || !config.gmailPassword) return null
  const user = config.gmailUser
  const pass = config.gmailPassword
  let client: ImapFlow | null = null

  async function connection(): Promise<ImapFlow> {
    if (client?.usable) return client
    client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    })
    await client.connect()
    return client
  }

  return {
    async folders() {
      const connection_ = await connection()
      const list = await connection_.list()
      return list.map((folder) => ({ path: folder.path }))
    },

    async syncFolder(folder, fromUid) {
      const connection_ = await connection()
      const lock = await connection_.getMailboxLock(folder)
      try {
        const mailbox = connection_.mailbox
        if (!mailbox) return { messages: [], uidValidity: '0', flags: [] }
        const exists = Number(mailbox.exists ?? 0)
        const uidValidity = String(mailbox.uidValidity ?? '0')
        const messages: MailMessage[] = []
        const flags: MailFlags[] = []
        if (exists === 0) return { messages, uidValidity, flags }

        const uidMode = fromUid > 0
        const range = uidMode
          ? `${fromUid + 1}:*`
          : `${Math.max(1, exists - INITIAL_LIMIT + 1)}:*`

        const raw: RawMessage[] = []
        for await (const item of connection_.fetch(
          range,
          { uid: true, envelope: true, flags: true, internalDate: true },
          uidMode ? { uid: true } : undefined,
        )) {
          raw.push(item as unknown as RawMessage)
        }

        const fetched = raw.filter((item) => item.uid > fromUid).sort((a, b) => a.uid - b.uid)
        const cutoff = Date.now() - BODY_DAYS * 86_400_000
        const withBody = fetched
          .filter((item) => (item.internalDate?.getTime() ?? 0) >= cutoff)
          .slice(-BODY_LIMIT)

        const parsed = new Map<number, { body: string; snippet: string; attachments: string[] }>()
        if (withBody.length > 0) {
          const bodyRange = withBody.map((item) => item.uid).join(',')
          for await (const item of connection_.fetch(bodyRange, { uid: true, source: true }, { uid: true })) {
            const message = item as unknown as RawMessage
            if (!message.source) continue
            try {
              const mail = await simpleParser(message.source)
              const text = (mail.text ?? '').trim()
              parsed.set(message.uid, {
                body: text.slice(0, BODY_MAX_CHARS),
                snippet: text.replace(/\s+/g, ' ').slice(0, 200),
                attachments: mail.attachments
                  .map((attachment) => attachment.filename)
                  .filter((name): name is string => Boolean(name)),
              })
            } catch {
              // unparseable message still appears with headers only
            }
          }
        }

        for (const item of fetched) {
          const extra = parsed.get(item.uid)
          messages.push({
            folder,
            uid: item.uid,
            messageId: item.envelope?.messageId ?? null,
            sender: senderOf(item.envelope),
            subject: item.envelope?.subject ?? '(no subject)',
            date: (item.internalDate ?? item.envelope?.date ?? new Date()).toISOString(),
            seen: item.flags?.has('\\Seen') ?? false,
            starred: item.flags?.has('\\Flagged') ?? false,
            snippet: extra?.snippet ?? '',
            body: extra?.body ?? null,
            attachments: extra?.attachments ?? [],
          })
        }

        const highestUid = messages.at(-1)?.uid ?? 0
        if (highestUid > 0) {
          const flagRange = `${Math.max(1, highestUid - FLAG_WINDOW + 1)}:*`
          for await (const item of connection_.fetch(flagRange, { uid: true, flags: true }, { uid: true })) {
            const message = item as unknown as RawMessage
            flags.push({
              uid: message.uid,
              seen: message.flags?.has('\\Seen') ?? false,
              starred: message.flags?.has('\\Flagged') ?? false,
            })
          }
        }

        return { messages, uidValidity, flags }
      } finally {
        lock.release()
      }
    },
  }
}
