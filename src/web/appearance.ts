import type { Appearance } from './api.js'

/** The appearance knobs are plain CSS variables, written by the dashboard and by the settings page. */
export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement
  root.style.setProperty('--blur-panel', `${appearance.blur}px`)
  root.style.setProperty('--blur-menu', `${Math.min(30, appearance.blur + 4)}px`)
  root.style.setProperty('--grain-opacity', String(appearance.grain / 100))
  root.style.setProperty('--shadow-scale', String(appearance.shadow / 100))
  root.style.setProperty('--photo-brightness', String(appearance.photo / 100))
  root.dataset.motion = appearance.motion
}
