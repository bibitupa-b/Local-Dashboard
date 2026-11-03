import { useEffect, useRef, useState } from 'react'

/**
 * A fixed overlay can leave without moving the page, so its dismissal gets to play out
 * (styles.css `.modal-backdrop.leaving`) before the caller unmounts it.
 */
export function useLeaving() {
  const [leaving, setLeaving] = useState(false)
  const closing = useRef(false)

  function close(action: () => void): void {
    if (closing.current) return
    closing.current = true
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      action()
      return
    }
    setLeaving(true)
    setTimeout(action, 140)
  }

  return { leaving, close }
}

// Page shortcuts (`/`, `b`, Escape) must stay inert while any dialog holds the screen.
let openDialogs = 0

export function dialogOpen(): boolean {
  return openDialogs > 0
}

/**
 * One dialog pattern: focus the first control on open, keep Tab inside, close on Escape,
 * and give focus back to whatever opened it.
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return undefined
    openDialogs++
    const previous = document.activeElement as HTMLElement | null
    const focusables = () =>
      [...(ref.current?.querySelectorAll<HTMLElement>('input, textarea, button, a[href]') ?? [])].filter(
        (node) => !node.hasAttribute('disabled'),
      )
    const list = focusables()
    ;(list[0] ?? ref.current)?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const current = focusables()
      const first = current[0]
      const last = current[current.length - 1]
      if (!first || !last) return
      // Clicking the dialog's own text drops focus to <body>; Tab must come back in, not move on.
      if (!ref.current?.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openDialogs--
      previous?.focus()
    }
  }, [open])

  return ref
}
