import type { AttentionItem } from '../attention.js'

export const MAX_DIGEST_CHARS = 12_000

export type DigestInput = {
  since: Date
  vaultChanges: Array<{ path: string; added: number; removed: number }>
  tasks: Array<{ text: string; done: boolean; tag: string | null }>
  attention: AttentionItem[]
  driveChanges: Array<{ name: string; kind: string }>
  extra?: Array<{ title: string; lines: string[] }>
}

function clip(text: string): string {
  return text.length > 200 ? `${text.slice(0, 197)}...` : text
}

function groupTasks(tasks: DigestInput['tasks']): string[] {
  const open = tasks.filter((task) => !task.done)
  const lines: string[] = [`Open: ${open.length}, completed recently: ${tasks.length - open.length}`]

  const tags = new Map<string, number>()
  const untagged: string[] = []
  for (const task of open) {
    if (task.tag) tags.set(task.tag, (tags.get(task.tag) ?? 0) + 1)
    else untagged.push(task.text)
  }
  for (const [tag, count] of tags) lines.push(`#${tag} (${count} open)`)
  for (const text of untagged.slice(0, 30)) lines.push(`- ${clip(text)}`)
  return lines
}

export function buildDigest(input: DigestInput): string {
  const lines: string[] = [`# Activity since ${input.since.toISOString()}`, '']

  lines.push('## Vault changes')
  if (input.vaultChanges.length === 0) lines.push('No changes')
  else
    for (const change of input.vaultChanges) {
      lines.push(`- ${clip(change.path)} (+${change.added}/-${change.removed})`)
    }

  lines.push('', '## Google Drive')
  if (input.driveChanges.length === 0) lines.push('No changes')
  else for (const change of input.driveChanges) lines.push(`- ${clip(change.name)} (${change.kind})`)

  lines.push('', '## Tasks')
  lines.push(...groupTasks(input.tasks))

  for (const section of input.extra ?? []) {
    lines.push('', `## ${section.title}`)
    lines.push(...(section.lines.length > 0 ? section.lines : ['Nothing']))
  }

  lines.push('', '## Needs attention')
  if (input.attention.length === 0) lines.push('Nothing needs attention')
  else
    for (const item of input.attention) {
      const count = item.count && item.count > 1 ? ` x${item.count}` : ''
      lines.push(`- [${item.kind}] ${clip(item.label)}${count} — ${clip(item.detail)}`)
    }

  const digest = lines.join('\n')
  if (digest.length <= MAX_DIGEST_CHARS) return digest
  const cut = digest.lastIndexOf('\n', MAX_DIGEST_CHARS - 20)
  return `${digest.slice(0, cut > 0 ? cut : MAX_DIGEST_CHARS - 20)}\n...truncated`
}
