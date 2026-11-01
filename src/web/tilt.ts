const SELECTOR = [
  'button:not(:disabled)',
  'a',
  'summary',
  'input:not([type="checkbox"]):not([type="radio"])',
  'textarea',
  'select',
  '.pill',
  '.card',
  '.result',
  '.event',
  '.conn-row',
  '.suggest .item',
  '.check',
].join(', ')

function prefersReduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type Values = { rx: number; ry: number; scale: number; mx: number; my: number }

let current: HTMLElement | null = null
let target: Values | null = null
let smoothed: Values | null = null
let frame = 0

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

function reset(): void {
  stop()
  if (current) {
    current.classList.remove('tilting')
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

function targetOf(event: PointerEvent): HTMLElement | null {
  if (event.pointerType === 'touch') return null
  const element = (event.target as Element | null)?.closest?.(SELECTOR)
  if (!(element instanceof HTMLElement)) return null
  if (element.closest('.modal-backdrop')) return null
  if (element.matches('input, textarea, select') && element === document.activeElement) return null
  return element
}

export function initTilt(): void {
  document.addEventListener('pointermove', (event) => {
    if (prefersReduced()) {
      reset()
      return
    }
    const element = targetOf(event)
    if (!element) {
      reset()
      return
    }

    if (element !== current) {
      reset()
      current = element
      element.classList.add('tilt-target', 'tilting')
      smoothed = { rx: 0, ry: 0, scale: 1, mx: 50, my: 50 }
    }

    const rect = element.getBoundingClientRect()
    const px = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5
    const py = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5

    const isCard = element.matches('.card')
    const isField = element.matches('input, textarea, select')
    const strength = isCard ? 3 : isField ? 2 : 8
    const scale = isCard ? 1.004 : isField ? 1.001 : 1.012

    target = {
      rx: -py * strength,
      ry: px * strength,
      scale,
      mx: (px + 0.5) * 100,
      my: (py + 0.5) * 100,
    }
    start()
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
