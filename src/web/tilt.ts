const TILT_SELECTOR = '.card, .today'
const BLOCKERS = 'button, a, input, textarea, select, summary, label, .pill, .conn-actions'
const DWELL_MS = 150

function prefersReduced(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

type Values = { rx: number; ry: number; scale: number; mx: number; my: number }

let current: HTMLElement | null = null
let pending: HTMLElement | null = null
let dwell: ReturnType<typeof setTimeout> | undefined
let point: { x: number; y: number } | null = null
let target: Values | null = null
let smoothed: Values | null = null
let frame = 0

export function tiltTargetFor(target: Element | null): HTMLElement | null {
  if (!target) return null
  if (target.closest('.modal-backdrop')) return null
  if (target.closest(BLOCKERS)) return null
  const element = target.closest(TILT_SELECTOR)
  return element instanceof HTMLElement ? element : null
}

function valuesFor(element: HTMLElement, x: number, y: number): Values {
  const rect = element.getBoundingClientRect()
  const px = (x - rect.left) / Math.max(rect.width, 1) - 0.5
  const py = (y - rect.top) / Math.max(rect.height, 1) - 0.5
  return {
    rx: -py * 1.5,
    ry: px * 1.5,
    scale: 1.002,
    mx: (px + 0.5) * 100,
    my: (py + 0.5) * 100,
  }
}

function apply(element: HTMLElement, values: Values): void {
  element.style.setProperty('--tilt-x', `${values.rx.toFixed(2)}deg`)
  element.style.setProperty('--tilt-y', `${values.ry.toFixed(2)}deg`)
  element.style.setProperty('--tilt-scale', values.scale.toFixed(3))
  element.style.setProperty('--mx', `${values.mx.toFixed(1)}%`)
  element.style.setProperty('--my', `${values.my.toFixed(1)}%`)
}

function tick(): void {
  if (!current || !target || !smoothed) return
  smoothed.rx += (target.rx - smoothed.rx) * 0.24
  smoothed.ry += (target.ry - smoothed.ry) * 0.24
  smoothed.scale += (target.scale - smoothed.scale) * 0.24
  // the light lags a little behind the pointer, which makes it feel alive
  smoothed.mx += (target.mx - smoothed.mx) * 0.32
  smoothed.my += (target.my - smoothed.my) * 0.32
  apply(current, smoothed)
  frame = requestAnimationFrame(tick)
}

function start(): void {
  if (frame) return
  frame = requestAnimationFrame(tick)
}

function stop(): void {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
}

function clearDwell(): void {
  if (dwell) clearTimeout(dwell)
  dwell = undefined
  pending = null
}

function reset(): void {
  stop()
  clearDwell()
  point = null
  if (current) {
    current.classList.remove('tilt-target', 'tilting')
    current.style.removeProperty('--tilt-x')
    current.style.removeProperty('--tilt-y')
    current.style.removeProperty('--tilt-scale')
    current.style.removeProperty('--mx')
    current.style.removeProperty('--my')
  }
  current = null
  target = null
  smoothed = null
}

function activate(element: HTMLElement): void {
  current = element
  element.classList.add('tilt-target', 'tilting')
  smoothed = { rx: 0, ry: 0, scale: 1, mx: 50, my: 50 }
  target = point ? valuesFor(element, point.x, point.y) : null
  start()
}

export function initTilt(): void {
  document.addEventListener('pointermove', (event) => {
    if (prefersReduced()) {
      reset()
      return
    }
    const element = tiltTargetFor(event.target as Element | null)
    if (!element) {
      reset()
      return
    }
    point = { x: event.clientX, y: event.clientY }

    if (element === current) {
      target = valuesFor(element, point.x, point.y)
      start()
      return
    }
    // A quick pass across the screen must not move anything.
    if (element === pending) return

    reset()
    pending = element
    point = { x: event.clientX, y: event.clientY }
    dwell = setTimeout(() => {
      dwell = undefined
      const next = pending
      pending = null
      if (next) activate(next)
    }, DWELL_MS)
  })

  document.addEventListener('pointerout', (event) => {
    if (!current) return
    const related = event.relatedTarget as Node | null
    if (!related || !current.contains(related)) reset()
  })

  document.documentElement.addEventListener('pointerleave', reset)
  window.addEventListener('mouseout', (event) => {
    if (!event.relatedTarget) reset()
  })
  window.addEventListener('blur', reset)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset()
  })
}
