const SELECTOR =
  'button:not(:disabled), .pill, .card, .result, .event, .conn-row, .suggest .item'

function prefersReduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let current: HTMLElement | null = null

function reset(): void {
  if (!current) return
  current.classList.remove('tilting')
  current.style.removeProperty('--tilt-x')
  current.style.removeProperty('--tilt-y')
  current = null
}

function targetOf(event: PointerEvent): HTMLElement | null {
  if (event.pointerType === 'touch') return null
  const element = (event.target as Element | null)?.closest?.(SELECTOR)
  if (!(element instanceof HTMLElement)) return null
  if (element.closest('.modal-backdrop')) return null
  return element
}

/** One global pointer listener drives the tilt-shift hover on all surfaces. */
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
    }
    const rect = element.getBoundingClientRect()
    const px = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5
    const py = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5
    const strength = element.matches('button, .pill, .event, .result, .conn-row, .suggest .item')
      ? 3
      : 0.7
    element.style.setProperty('--tilt-x', `${(-py * strength).toFixed(2)}deg`)
    element.style.setProperty('--tilt-y', `${(px * strength).toFixed(2)}deg`)
  })

  document.addEventListener('pointerout', (event) => {
    if (!current) return
    const related = event.relatedTarget as Node | null
    if (!related || !current.contains(related)) reset()
  })

  window.addEventListener('blur', reset)
}
