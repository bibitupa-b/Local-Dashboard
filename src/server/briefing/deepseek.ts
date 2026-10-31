export class BriefingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'BriefingError'
  }
}

const SYSTEM = `You are a concise daily briefing assistant for one person's personal knowledge base and cloud drive.
Given a digest of recent activity, write 5-7 short bullets in the same language as the note titles where possible:
what moved, what is stuck, and one concrete suggestion for today.
Plain text bullets, no preamble, no headings, no closing remarks.`

export async function generateBriefing(
  apiKey: string,
  digest: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.3,
      max_tokens: 700,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: digest },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) throw new BriefingError(`DeepSeek responded ${res.status}`, res.status)

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const markdown = data.choices?.[0]?.message?.content?.trim()
  if (!markdown) throw new BriefingError('DeepSeek returned an empty response')
  return markdown
}
