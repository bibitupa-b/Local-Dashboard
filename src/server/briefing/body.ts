import type { DigestRef } from './digest.js'

/** What the model answered: `refs` are digest line numbers, not links yet. */
export type ParsedOutput = {
  headline: string
  bullets: Array<{ text: string; refs: number[] }>
  suggestion: string
}

/** What the page and the database keep: every point carries the sources it came from. */
export type BriefingBody = {
  headline: string
  bullets: Array<{ text: string; refs: DigestRef[] }>
  suggestion: string
}

const CAPS = { headline: 200, bullet: 400, suggestion: 300 }
const SUGGESTION = /^(suggestion|предложение|рекомендация)\s*[:—–-]\s*/i

function cut(value: unknown, cap: number): string {
  return typeof value === 'string' ? value.trim().slice(0, cap) : ''
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => Number.isInteger(item) && (item as number) >= 1)
}

function fromJson(raw: string): ParsedOutput | null {
  let data: unknown
  try {
    data = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''))
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const source = data as { headline?: unknown; bullets?: unknown; suggestion?: unknown }
  const headline = cut(source.headline, CAPS.headline)
  const bullets = Array.isArray(source.bullets)
    ? source.bullets.flatMap((bullet) => {
        const entry = bullet as { text?: unknown; refs?: unknown }
        const text = cut(entry.text, CAPS.bullet)
        return text ? [{ text, refs: numbers(entry.refs) }] : []
      })
    : []
  if (!headline && bullets.length === 0) return null
  return { headline, bullets, suggestion: cut(source.suggestion, CAPS.suggestion) }
}

function fromLines(raw: string): ParsedOutput {
  const lines = raw
    .split('\n')
    .map((line) => line.trim().replace(/^[-*•]\s+/, ''))
    .filter(Boolean)
  const [first = '', ...rest] = lines
  const bullets: ParsedOutput['bullets'] = []
  let suggestion = ''
  for (const line of rest) {
    const match = line.match(SUGGESTION)
    if (match) suggestion = line.slice(match[0].length).trim().slice(0, CAPS.suggestion)
    else bullets.push({ text: line.slice(0, CAPS.bullet), refs: [] })
  }
  return {
    headline: first.slice(0, CAPS.headline),
    bullets,
    suggestion,
  }
}

/** JSON when the model obeyed; a plain answer is read as a headline and its lines. */
export function parseModelOutput(raw: string): ParsedOutput {
  return fromJson(raw.trim()) ?? fromLines(raw.trim())
}

/** Keeps a bullet's points that name a real digest line, once each. */
export function resolveRefs(parsed: ParsedOutput, refs: Map<number, DigestRef>): BriefingBody {
  return {
    headline: parsed.headline,
    bullets: parsed.bullets.map((bullet) => ({
      text: bullet.text,
      refs: [...new Set(bullet.refs)].flatMap((number) => {
        const ref = refs.get(number)
        return ref ? [ref] : []
      }),
    })),
    suggestion: parsed.suggestion,
  }
}

export function renderMarkdown(body: BriefingBody): string {
  return [
    body.headline,
    ...body.bullets.map((bullet) => `- ${bullet.text}`),
    body.suggestion ? `Suggestion: ${body.suggestion}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
