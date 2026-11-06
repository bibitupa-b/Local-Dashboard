/**
 * Widgets live in the empty gutters of a wide window or inline above the briefing on a narrow one.
 * The layout is one list the server stores and the client edits.
 */
export const WIDGET_IDS = ['now-next', 'open-loops', 'deepseek-week'] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

export type WidgetSlot = 'left' | 'right' | 'inline' | 'hidden'

export type WidgetLayout = {
  id: WidgetId
  slot: WidgetSlot
  order: number
  collapsed: boolean
  /** Wider card in a side column (240 → 340px). */
  wide: boolean
  /** Show every row instead of the first three. */
  expanded: boolean
  /** What happens to a side widget when the window is too narrow for gutters. */
  narrow: 'inline' | 'hide'
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
  'now-next': 'Now / Next',
  'open-loops': 'Open loops',
  'deepseek-week': 'DeepSeek this week',
}

export const DEFAULT_WIDGET_LAYOUT: WidgetLayout[] = [
  {
    id: 'now-next',
    slot: 'left',
    order: 0,
    collapsed: false,
    wide: false,
    expanded: false,
    narrow: 'inline',
  },
  {
    id: 'open-loops',
    slot: 'right',
    order: 0,
    collapsed: false,
    wide: false,
    expanded: false,
    narrow: 'inline',
  },
  {
    id: 'deepseek-week',
    slot: 'right',
    order: 1,
    collapsed: false,
    wide: false,
    expanded: false,
    narrow: 'inline',
  },
]

const SLOTS: WidgetSlot[] = ['left', 'right', 'inline', 'hidden']

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

/** Anything stored or sent is squeezed back into the shape the interface can trust. */
export function normalizeWidgetLayout(value: unknown): WidgetLayout[] {
  const source = Array.isArray(value) ? value : []
  const byId = new Map<string, Record<string, unknown>>()
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    if (typeof record.id === 'string' && !byId.has(record.id)) byId.set(record.id, record)
  }

  const usedBySlot = new Map<WidgetSlot, Set<number>>()
  return WIDGET_IDS.map((id, index) => {
    const fallback = DEFAULT_WIDGET_LAYOUT[index]!
    const record = byId.get(id) ?? {}
    const slot = SLOTS.includes(record.slot as WidgetSlot)
      ? (record.slot as WidgetSlot)
      : fallback.slot
    const used = usedBySlot.get(slot) ?? new Set<number>()
    usedBySlot.set(slot, used)
    let order =
      typeof record.order === 'number' && Number.isFinite(record.order)
        ? Math.max(0, Math.round(record.order))
        : fallback.order
    // Order only has to be unique inside a column; two columns never compete.
    while (used.has(order)) order++
    used.add(order)
    const narrow: WidgetLayout['narrow'] = record.narrow === 'hide' ? 'hide' : 'inline'
    return {
      id,
      slot,
      order,
      collapsed: bool(record.collapsed, fallback.collapsed),
      wide: bool(record.wide, fallback.wide),
      expanded: bool(record.expanded, fallback.expanded),
      narrow,
    }
  }).sort((a, b) => a.order - b.order)
}

export type BriefingStats = {
  days: number
  count: number
  opens: number
  useful: number
  miss: number
  tokens: { prompt: number; completion: number }
  usageKnown: number
}
