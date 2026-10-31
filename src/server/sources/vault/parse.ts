export type ParsedTask = { text: string; tag: string | null; done: boolean }
export type ParsedNote = {
  frontmatter: Record<string, string | string[]>
  tasks: ParsedTask[]
}

const TASK = /^\s*- \[([ xX])\] (.*)$/
const TAG = /#([\p{L}\p{N}_/-]+)/u

function parseFrontmatter(lines: string[]): { data: Record<string, string | string[]>; rest: number } {
  const data: Record<string, string | string[]> = {}
  if (lines[0] !== '---') return { data, rest: 0 }
  const end = lines.indexOf('---', 1)
  if (end === -1) return { data, rest: 0 }

  let currentKey: string | null = null
  for (const line of lines.slice(1, end)) {
    const item = /^\s+-\s*(.+)$/.exec(line)
    if (item && currentKey) {
      const existing = data[currentKey]
      const value = item[1]!.trim()
      data[currentKey] = Array.isArray(existing) ? [...existing, value] : [value]
      continue
    }
    const pair = /^([\w-]+):\s*(.*)$/.exec(line)
    if (!pair) continue
    const key = pair[1]!
    currentKey = key
    const value = (pair[2] ?? '').trim()
    if (!value) continue
    const inline = /^\[(.*)\]$/.exec(value)
    data[key] = inline
      ? inline[1]!.split(',').map((part) => part.trim()).filter(Boolean)
      : value
  }
  return { data, rest: end + 1 }
}

export function parseNote(input: string): ParsedNote {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const { data, rest } = parseFrontmatter(lines)

  const tasks: ParsedTask[] = []
  for (const line of lines.slice(rest)) {
    const match = TASK.exec(line)
    if (!match) continue
    const body = match[2]!.trim()
    tasks.push({ text: body, tag: TAG.exec(body)?.[1] ?? null, done: match[1] !== ' ' })
  }
  return { frontmatter: data, tasks }
}
