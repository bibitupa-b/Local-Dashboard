import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AttentionItem, BriefingStats, Today } from './api.js'
import { WIDGET_LABELS, type WidgetId, type WidgetLayout, type WidgetSlot } from '../shared/widgets.js'

export type WidgetData = {
  today: Today | null
  attention: AttentionItem[] | null
  stats: BriefingStats | null
  hrefFor: (item: AttentionItem) => string | null
}

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** A cheap local clock: the widget must tick even when the page is not reloaded. */
function useNow(interval = 30_000): Date {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), interval)
    return () => clearInterval(timer)
  }, [interval])
  return new Date()
}

/** Order only matters inside a column; a move appends to the target column. */
export function changeWidget(
  layout: WidgetLayout[],
  id: WidgetId,
  change: Partial<WidgetLayout>,
): WidgetLayout[] {
  const current = layout.find((entry) => entry.id === id)
  const next = layout.map((entry) => (entry.id === id ? { ...entry, ...change } : entry))
  if (change.slot && current && change.slot !== current.slot) {
    const moved = next.find((entry) => entry.id === id)
    const max = layout
      .filter((entry) => entry.slot === change.slot && entry.id !== id)
      .reduce((value, entry) => Math.max(value, entry.order), -1)
    if (moved) moved.order = max + 1
  }
  return next
}

const minutesBetween = (from: Date, to: Date): string => {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}

/** The one line a narrow window can afford. */
function NowNextLine({ data }: { data: WidgetData }) {
  const events = data.today?.events ?? []
  const now = useNow()
  const current = events.find((event) => new Date(event.start) <= now && new Date(event.end) > now)
  const next = events.find((event) => new Date(event.start) > now)
  const free = data.today?.free?.[0]
  if (current) return <span>Now · {current.summary} until {clock(current.end)}</span>
  if (next) return <span>Next · {clock(next.start)} {next.summary}</span>
  if (free) return <span>Free until {clock(free.to)} · {minutesBetween(now, new Date(free.to))}</span>
  if (events.length > 0) return <span>Today is done · {events.length} events</span>
  return <span>Nothing on the calendar today.</span>
}

function NowNextBody({ data }: { data: WidgetData }) {
  const events = data.today?.events ?? []
  const now = useNow()
  const current = events.find((event) => new Date(event.start) <= now && new Date(event.end) > now)
  const next = events.find((event) => new Date(event.start) > now)
  const free = data.today?.free?.[0]
  return (
    <>
      {current ? (
        <p className="widget__line">
          <span className="widget__tag">Now</span>
          <span lang="auto">{current.summary}</span>
          <span className="widget__meta">until {clock(current.end)}</span>
        </p>
      ) : next ? (
        <p className="widget__line">
          <span className="widget__tag">Next</span>
          <span lang="auto">{next.summary}</span>
          <span className="widget__meta">{clock(next.start)} · {minutesBetween(now, new Date(next.start))}</span>
        </p>
      ) : (
        <p className="widget__line muted">
          {events.length > 0 ? `Today is done · ${events.length} events` : 'Nothing on the calendar today.'}
        </p>
      )}
      {current && next && (
        <p className="widget__line">
          <span className="widget__tag">Then</span>
          <span lang="auto">{next.summary}</span>
          <span className="widget__meta">{clock(next.start)}</span>
        </p>
      )}
      {free && (
        <p className="widget__line">
          <span className="widget__tag">Free</span>
          <span>{minutesBetween(now, new Date(free.to))} until {clock(free.to)}</span>
        </p>
      )}
      {data.today?.conflicts?.length ? (
        <p className="widget__line widget__line--warn">{data.today.conflicts[0]}</p>
      ) : null}
    </>
  )
}

const LOOP_ORDER: AttentionItem['kind'][] = [
  'reply',
  'mail',
  'task',
  'google-task',
  'slack',
  'stale-project',
  'inbox',
  'github',
]

function loopItems(data: WidgetData, expanded: boolean): AttentionItem[] {
  const items = data.attention ?? []
  const ordered = [...items].sort(
    (a, b) => LOOP_ORDER.indexOf(a.kind) - LOOP_ORDER.indexOf(b.kind),
  )
  return expanded ? ordered.slice(0, 8) : ordered.slice(0, 3)
}

function OpenLoopsLine({ data }: { data: WidgetData }) {
  const items = loopItems(data, false)
  if (items.length === 0) return <span>Nothing waiting.</span>
  const first = items[0]!
  return (
    <span>
      {items.length} open · {first.label}
    </span>
  )
}

function OpenLoopsBody({ data, expanded }: { data: WidgetData; expanded: boolean }) {
  const items = loopItems(data, expanded)
  if (items.length === 0) return <p className="widget__line muted">Nothing waiting.</p>
  return (
    <>
      {items.map((item, index) => {
        const href = data.hrefFor(item)
        const content = (
          <>
            <span className={`status-dot status-dot--${item.count ? 'attention' : 'ok'}`} aria-hidden="true" />
            <span className="widget__label" lang="auto">{item.label}</span>
            {item.count ? <span className="widget__meta">{item.count}</span> : null}
          </>
        )
        return href ? (
          <a key={`${item.kind}-${index}`} className="widget__line widget__line--link" href={href}>
            {content}
          </a>
        ) : (
          <p key={`${item.kind}-${index}`} className="widget__line">{content}</p>
        )
      })}
    </>
  )
}

const FLASH_INPUT = 0.3
const FLASH_OUTPUT = 1.2

function deepseekCost(stats: BriefingStats | null): number {
  if (!stats) return 0
  return (stats.tokens.prompt / 1_000_000) * FLASH_INPUT + (stats.tokens.completion / 1_000_000) * FLASH_OUTPUT
}

const tokensTotal = (stats: BriefingStats | null): number =>
  stats ? stats.tokens.prompt + stats.tokens.completion : 0

function DeepSeekLine({ data }: { data: WidgetData }) {
  const stats = data.stats
  if (!stats || stats.count === 0) return <span>No briefings this week yet.</span>
  return (
    <span>
      {stats.count} briefings · {tokensTotal(stats).toLocaleString('en-GB')} tokens · ≈ ${deepseekCost(stats).toFixed(3)}
    </span>
  )
}

function DeepSeekBody({ data }: { data: WidgetData }) {
  const stats = data.stats
  if (!stats || stats.count === 0) {
    return <p className="widget__line muted">No briefings this week yet.</p>
  }
  return (
    <>
      <p className="widget__line"><span className="widget__tag">Briefings</span><span>{stats.count} · {stats.opens} opens</span></p>
      <p className="widget__line"><span className="widget__tag">Verdicts</span><span>{stats.useful} useful · {stats.miss} miss</span></p>
      <p className="widget__line">
        <span className="widget__tag">Tokens</span>
        <span>{(stats.tokens.prompt / 1000).toFixed(1)}k in · {(stats.tokens.completion / 1000).toFixed(1)}k out</span>
      </p>
      <p className="widget__line">
        <span className="widget__tag">Cost</span>
        <span>≈ ${deepseekCost(stats).toFixed(3)} at Flash rates</span>
      </p>
      {stats.usageKnown < stats.count && (
        <p className="widget__line widget__meta">Older briefings have no token data.</p>
      )}
    </>
  )
}

function WidgetBody({ id, data, expanded }: { id: WidgetId; data: WidgetData; expanded: boolean }) {
  if (id === 'now-next') return <NowNextBody data={data} />
  if (id === 'open-loops') return <OpenLoopsBody data={data} expanded={expanded} />
  return <DeepSeekBody data={data} />
}

function WidgetLine({ id, data }: { id: WidgetId; data: WidgetData }) {
  if (id === 'now-next') return <NowNextLine data={data} />
  if (id === 'open-loops') return <OpenLoopsLine data={data} />
  return <DeepSeekLine data={data} />
}

const SLOT_LABELS: Record<WidgetSlot, string> = {
  left: 'Left column',
  right: 'Right column',
  inline: 'Inline',
  hidden: 'Hidden',
}

/** A spring that follows the pointer, so the ghost feels picked up rather than glued. */
function useGhost() {
  const node = useRef<HTMLDivElement>(null)
  const physics = useRef({ x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, raf: 0, tilt: 0 })

  const paint = () => {
    const p = physics.current
    p.vx = (p.vx + (p.tx - p.x) * 0.3) * 0.72
    p.vy = (p.vy + (p.ty - p.y) * 0.3) * 0.72
    p.x += p.vx
    p.y += p.vy
    p.tilt += (Math.max(-6, Math.min(6, p.vx * 0.35)) - p.tilt) * 0.2
    if (node.current) {
      node.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.tilt}deg)`
    }
    p.raf = requestAnimationFrame(paint)
  }

  const start = (x: number, y: number): void => {
    const p = physics.current
    p.x = x
    p.y = y
    p.tx = x
    p.ty = y
    p.vx = 0
    p.vy = 0
    p.tilt = 0
    if (!p.raf) p.raf = requestAnimationFrame(paint)
  }

  const move = (x: number, y: number): void => {
    physics.current.tx = x
    physics.current.ty = y
  }

  const stop = (): void => {
    cancelAnimationFrame(physics.current.raf)
    physics.current.raf = 0
  }

  return { node, start, move, stop }
}

type DragState = {
  id: WidgetId
  fromSlot: WidgetSlot
  offsetX: number
  offsetY: number
  width: number
  height: number
  originX: number
  originY: number
}

/**
 * One widget card: header actions plus the shared drag. Drag is only live when both columns
 * exist; the card you dragged stays in place as a placeholder while the ghost follows.
 */
function WidgetCard({
  item,
  data,
  wide,
  onItemChange,
  onGrab,
  dragging,
}: {
  item: WidgetLayout
  data: WidgetData
  wide: boolean
  onItemChange: (id: WidgetId, change: Partial<WidgetLayout>) => void
  onGrab: (event: React.PointerEvent, item: WidgetLayout) => void
  dragging: boolean
}) {
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return undefined
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  function update(change: Partial<WidgetLayout>): void {
    onItemChange(item.id, change)
    setMenu(false)
  }

  return (
    <section
      className={`widget${wide ? ' widget--wide' : ''}${item.collapsed ? ' is-collapsed' : ''}${
        dragging ? ' is-dragging' : ''
      }`}
      data-widget-id={item.id}
      data-widget-slot={item.slot}
    >
      <header
        className="widget__head"
        onPointerDown={(event) => {
          if (!wide) return
          if ((event.target as HTMLElement).closest('button')) return
          onGrab(event, item)
        }}
      >
        <span className="widget__title">{WIDGET_LABELS[item.id]}</span>
        <span className="widget__actions">
          <button
            type="button"
            className="widget__btn"
            aria-label={item.collapsed ? `Expand ${WIDGET_LABELS[item.id]}` : `Collapse ${WIDGET_LABELS[item.id]}`}
            aria-expanded={!item.collapsed}
            onClick={() => update({ collapsed: !item.collapsed })}
          >
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
              <path
                d={item.collapsed ? 'M2 3.5 5 6.5 8 3.5' : 'M2 6.5 5 3.5 8 6.5'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="widget__menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="widget__btn"
              aria-label={`${WIDGET_LABELS[item.id]} options`}
              aria-expanded={menu}
              onClick={() => setMenu((value) => !value)}
            >
              ⋯
            </button>
            {menu && (
              <span className="widget__menu" role="menu">
                <span className="widget__menu-label">Place</span>
                {(Object.keys(SLOT_LABELS) as WidgetSlot[]).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.slot === slot}
                    onClick={() => update({ slot })}
                  >
                    {SLOT_LABELS[slot]}
                  </button>
                ))}
                <span className="widget__menu-sep" />
                <button type="button" role="menuitem" onClick={() => update({ wide: !item.wide })}>
                  {item.wide ? 'Narrower' : 'Wider'}
                </button>
                <button type="button" role="menuitem" onClick={() => update({ expanded: !item.expanded })}>
                  {item.expanded ? 'Show fewer rows' : 'Show all rows'}
                </button>
                <button type="button" role="menuitem" onClick={() => update({ narrow: item.narrow === 'hide' ? 'inline' : 'hide' })}>
                  {item.narrow === 'hide' ? 'On narrow: inline' : 'On narrow: hide'}
                </button>
              </span>
            )}
          </span>
        </span>
      </header>
      {!item.collapsed && (
        <div className="widget__body">
          {wide ? (
            <WidgetBody id={item.id} data={data} expanded={item.expanded} />
          ) : (
            <WidgetLine id={item.id} data={data} />
          )}
        </div>
      )}
    </section>
  )
}

export function WidgetColumns({
  layout,
  onChange,
  wide,
  data,
}: {
  layout: WidgetLayout[]
  onChange: (next: WidgetLayout[]) => void
  wide: boolean
  data: WidgetData
}) {
  const ghost = useGhost()
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)

  function grab(event: React.PointerEvent, item: WidgetLayout): void {
    if (event.button !== 0) return
    const rect = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    const state: DragState = {
      id: item.id,
      fromSlot: item.slot,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      originX: rect.left,
      originY: rect.top,
    }
    dragRef.current = state
    setDrag(state)
    document.body.classList.add('is-widget-dragging')
    ghost.start(rect.left, rect.top)

    const returnHome = (current: DragState): void => {
      ghost.move(current.originX, current.originY)
      const reduced =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) {
        ghost.stop()
        setDrag(null)
        return
      }
      setTimeout(() => {
        ghost.stop()
        setDrag(null)
      }, 260)
    }

    const cleanup = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      document.body.classList.remove('is-widget-dragging')
    }

    const move = (moveEvent: PointerEvent) => {
      ghost.move(moveEvent.clientX - state.offsetX, moveEvent.clientY - state.offsetY)
    }

    const cancel = (): void => {
      cleanup()
      const current = dragRef.current
      dragRef.current = null
      if (current) returnHome(current)
      else {
        ghost.stop()
        setDrag(null)
      }
    }

    const up = (upEvent: PointerEvent) => {
      cleanup()
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY) as HTMLElement | null
      const column = target?.closest<HTMLElement>('[data-widget-column]')
      const slot = column?.dataset.widgetColumn as WidgetSlot | undefined
      const current = dragRef.current
      dragRef.current = null
      if (!current) {
        ghost.stop()
        setDrag(null)
        return
      }
      if (!slot || slot === 'inline') {
        // Dropped outside a column: the ghost springs back to where it came from.
        returnHome(current)
        return
      }
      const peers = [...column!.querySelectorAll<HTMLElement>('[data-widget-id]')].filter(
        (node) => node.dataset.widgetId !== current.id,
      )
      let index = peers.length
      for (let i = 0; i < peers.length; i++) {
        const box = peers[i]!.getBoundingClientRect()
        if (upEvent.clientY < box.top + box.height / 2) {
          index = i
          break
        }
      }
      const next = layout.map((entry) => ({ ...entry }))
      const dragged = next.find((entry) => entry.id === current.id)
      if (dragged) {
        dragged.slot = slot
        const siblings = next
          .filter((entry) => entry.slot === slot && entry.id !== dragged.id)
          .sort((a, b) => a.order - b.order)
        siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, dragged)
        siblings.forEach((entry, order) => {
          entry.order = order
        })
        const others = next.filter((entry) => entry.slot !== slot)
        onChange([...others, ...siblings])
      }
      ghost.stop()
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
  }

  function column(slot: 'left' | 'right'): WidgetLayout[] {
    return layout.filter((item) => item.slot === slot).sort((a, b) => a.order - b.order)
  }

  function itemChange(id: WidgetId, change: Partial<WidgetLayout>): void {
    onChange(changeWidget(layout, id, change))
  }

  function renderColumn(slot: 'left' | 'right') {
    const items = column(slot)
    if (items.length === 0) return null
    return (
      <aside
        className={`widgets-col widgets-col--${slot}`}
        data-widget-column={slot}
        aria-label={`${slot} widgets`}
      >
        {items.map((item) => (
          <WidgetCard
            key={item.id}
            item={item}
            data={data}
            wide
            onItemChange={itemChange}
            onGrab={grab}
            dragging={drag?.id === item.id}
          />
        ))}
      </aside>
    )
  }

  return (
    <>
      {!wide ? null : renderColumn('left')}
      {drag &&
        createPortal(
          <div
            ref={ghost.node}
            className="widget widget--ghost"
            style={{ width: drag.width, height: drag.height, left: 0, top: 0 }}
            aria-hidden="true"
          >
            <header className="widget__head">
              <span className="widget__title">{WIDGET_LABELS[drag.id]}</span>
            </header>
            <div className="widget__body">
              <WidgetBody
                id={drag.id}
                data={data}
                expanded={layout.find((entry) => entry.id === drag.id)?.expanded ?? false}
              />
            </div>
          </div>,
          document.body,
        )}
      {!wide ? null : renderColumn('right')}
    </>
  )
}

export function WidgetsInline({
  layout,
  onChange,
  data,
  includeSide,
}: {
  layout: WidgetLayout[]
  onChange: (next: WidgetLayout[]) => void
  data: WidgetData
  /** A narrow window folds the side widgets into the page instead of dropping them. */
  includeSide: boolean
}) {
  const items = layout
    .filter(
      (item) =>
        item.slot === 'inline' ||
        (includeSide &&
          (item.slot === 'left' || item.slot === 'right') &&
          item.narrow === 'inline'),
    )
    .sort((a, b) => a.order - b.order)
  if (items.length === 0) return null
  return (
    <div className="widgets-inline">
      {items.map((item) => (
        <WidgetCard
          key={item.id}
          item={item}
          data={data}
          wide={false}
          onItemChange={(id, change) => onChange(changeWidget(layout, id, change))}
          onGrab={() => {}}
          dragging={false}
        />
      ))}
    </div>
  )
}
