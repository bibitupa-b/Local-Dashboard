import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { MailApi, MailFlags, MailMessage } from './mail.js'

const BODY_DAYS = 90
const INITIAL_LIMIT = 2000
const BODY_LIMIT = 200
const FLAG_WINDOW = 200
const BODY_MAX_CHARS = 100_000
const MAX_SOURCE_BYTES = 512 * 1024

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
  size?: number
  source?: Buffer
}

function senderOf(envelope: Envelope | undefined): string {
  const from = envelope?.from?.[0]
  if (!from?.address) return 'unknown'
  return from.name ? `${from.name} <${from.address}>` : from.address
}

type HeadersLike = { get(name: string): unknown }

export function isBulkMessage(headers: HeadersLike): boolean {
  if (headers.get('list-unsubscribe')) return true
  const precedence = String(headers.get('precedence') ?? '').toLowerCase()
  if (precedence === 'bulk' || precedence === 'list') return true
  const auto = String(headers.get('auto-submitted') ?? '').toLowerCase()
  return auto !== '' && auto !== 'no'
}

export function createImapMailApi(creds: {
  user: string | null
  password: string | null
}): MailApi | null {
  if (!creds.user || !creds.password) return null
  const user = creds.user
  const pass = creds.password
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
    // Without this listener a post-connect socket error becomes an uncaught exception.
    client.on('error', (error) => console.error('[mail] IMAP error:', error))
    await client.connect()
    return client
  }

  return {
    async folders() {
      const connection_ = await connection()
      const list = await connection_.list()
      return list
        .filter((folder) => folder.specialUse !== '\\All' && !folder.flags?.has('\\Noselect'))
        .filter((folder) => !/all mail/i.test(folder.path))
        .map((folder) => ({ path: folder.path }))
    },

    async syncFolder(folder, fromUid) {
      const connection_ = await connection()
      const lock = await connection_.getMailboxLock(folder)
      try {
        const mailbox = connection_.mailbox
        if (!mailbox) throw new Error(`IMAP mailbox ${folder} was not opened`)
        const exists = Number(mailbox.exists ?? 0)
        const uidValidity = String(mailbox.uidValidity ?? '0')
        const uidNext = Number(mailbox.uidNext ?? 1)
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
          { uid: true, envelope: true, flags: true, internalDate: true, size: true },
          uidMode ? { uid: true } : undefined,
        )) {
          raw.push(item as unknown as RawMessage)
        }

        const fetched = raw.filter((item) => item.uid > fromUid).sort((a, b) => a.uid - b.uid)
        const cutoff = Date.now() - BODY_DAYS * 86_400_000
        const withBody = fetched
          .filter((item) => (item.internalDate?.getTime() ?? 0) >= cutoff)
          .filter((item) => (item.size ?? 0) <= MAX_SOURCE_BYTES)
          .slice(-BODY_LIMIT)

        const parsed = new Map<
          number,
          { body: string; snippet: string; attachments: string[]; bulk: boolean }
        >()
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
                bulk: isBulkMessage(mail.headers),
              })
            } catch (error) {
              console.warn(`[mail] could not parse uid ${message.uid} in ${folder}:`, error)
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
            bulk: extra?.bulk ?? false,
          })
        }

        const highestUid = Math.max(messages.at(-1)?.uid ?? 0, uidNext - 1)
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
