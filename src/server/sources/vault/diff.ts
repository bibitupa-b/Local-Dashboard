export type DiffResult = { added: number; removed: number; diff: string }

const MAX_LINES = 1500

function toLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n$/, '')
  return normalized === '' ? [] : normalized.split('\n')
}

export function lineDiff(before: string, after: string): DiffResult {
  const a = toLines(before)
  const b = toLines(after)

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    // shortcut: huge notes fall back to multiset counts without context — replace with a real diff if such notes ever matter
    const counts = new Map<string, number>()
    for (const line of a) counts.set(line, (counts.get(line) ?? 0) + 1)
    let removed = 0
    for (const line of b) {
      const left = counts.get(line) ?? 0
      if (left > 0) counts.set(line, left - 1)
    }
    for (const left of counts.values()) removed += left
    return { added: b.length - (a.length - removed), removed, diff: '' }
  }

  const width = b.length + 1
  const dp = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1]! + 1
          : Math.max(dp[(i + 1) * width + j]!, dp[i * width + j + 1]!)
    }
  }

  const diff: string[] = []
  let added = 0
  let removed = 0
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (dp[(i + 1) * width + j]! >= dp[i * width + j + 1]!) {
      diff.push(`-${a[i]}`)
      removed++
      i++
    } else {
      diff.push(`+${b[j]}`)
      added++
      j++
    }
  }
  while (i < a.length) {
    diff.push(`-${a[i++]}`)
    removed++
  }
  while (j < b.length) {
    diff.push(`+${b[j++]}`)
    added++
  }

  return { added, removed, diff: diff.join('\n') }
}
