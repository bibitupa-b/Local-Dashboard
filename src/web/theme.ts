/**
 * Derives the interface palette from a wallpaper.
 *
 * The room decides the colours: the dominant hues of the picture become accent, secondary and
 * tertiary, but every colour is pushed into a narrow lightness band and checked against the
 * glass composite so text stays readable on bright and dark images alike.
 */

export type Hsl = { h: number; s: number; l: number }

export type Theme = {
  vars: Record<string, string>
  accent: Hsl
  mist: Hsl
  glassAlpha: number
  glassDim: number
  /** The dark tint every glass pane is made of; it follows the wallpaper's hue. */
  glassBase: string
  /** The three hues the picture gave (or the person picked); the swatches read them. */
  hues: [number, number, number]
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const wrap = (hue: number): number => ((hue % 360) + 360) % 360

export const hsl = (color: Hsl): string =>
  `hsl(${color.h.toFixed(0)} ${(color.s * 100).toFixed(0)}% ${(color.l * 100).toFixed(0)}%)`

/** `rgb(var(--glass-base) / alpha)` needs the channels without a wrapper. */
const rgbTriplet = (color: Hsl): string => {
  const [r, g, b] = hslToRgb(color)
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const delta = max - min
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h: number
  if (max === red) h = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60
  else if (max === green) h = ((blue - red) / delta + 2) * 60
  else h = ((red - green) / delta + 4) * 60
  return { h, s, l }
}

function hslToRgb(color: Hsl): [number, number, number] {
  const h = wrap(color.h) / 360
  const s = clamp(color.s, 0, 1)
  const l = clamp(color.l, 0, 1)
  if (s === 0) {
    const gray = l * 255
    return [gray, gray, gray]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number): number => {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]
}

const channel = (value: number): number => {
  const v = value / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

export function luminanceOf(color: Hsl): number {
  const [r, g, b] = hslToRgb(color)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: Hsl, b: Hsl): number {
  const first = luminanceOf(a)
  const second = luminanceOf(b)
  const [light, dark] = first > second ? [first, second] : [second, first]
  return (light + 0.05) / (dark + 0.05)
}

/** Lightens a colour until it clears the ratio against the surface it sits on. */
function ensureContrast(color: Hsl, surface: Hsl, ratio: number): Hsl {
  let current = color
  while (contrastRatio(current, surface) < ratio && current.l < 0.92) {
    current = { ...current, l: current.l + 0.015 }
  }
  return current
}

/** The brightest grey a wallpaper may paint behind glass before the given colour fails 4.5:1. */
function brightestPassing(color: Hsl, ratio: number): number {
  let low = 0
  let high = 255
  for (let step = 0; step < 14; step++) {
    const mid = (low + high) / 2
    if (contrastRatio(color, { h: 0, s: 0, l: mid / 255 }) >= ratio) low = mid
    else high = mid
  }
  return low
}

const hueGap = (a: number, b: number): number => {
  const delta = Math.abs(a - b) % 360
  return Math.min(delta, 360 - delta)
}

const DARK_FILL = 12

/** The grey the glass composite settles at for a wallpaper pixel of this brightness. */
export function glassCompositeGray(pixel: number, theme: Theme): number {
  return pixel * theme.glassDim * (1 - theme.glassAlpha) + DARK_FILL * theme.glassAlpha
}

export const AURORA_THEME: Theme = {
  accent: { h: 28, s: 0.88, l: 0.69 },
  mist: { h: 220, s: 0.16, l: 0.76 },
  glassAlpha: 0.26,
  glassDim: 0.9,
  glassBase: '13 17 26',
  hues: [28, 158, 220],
  vars: {
    '--amber': '#F5B36B',
    '--mint': '#7ED9B0',
    '--ice': '#8DB8FF',
    '--periwinkle': '#9AA7FF',
    '--coral': '#F0A0A0',
    '--ink': '#F4F6FB',
    '--mist': '#AEB6C8',
    '--dim': '#7C8599',
    '--aurora-indigo': '#5E6AD2',
    '--aurora-teal': '#3FBFB2',
    '--aurora-amber': '#F5B36B',
    '--glass-alpha': '0.26',
    '--glass-dim': '0.9',
    '--glass-base': '13 17 26',
  },
}

export type ThemeOptions = {
  /** 0.6–1.5 against the wallpaper-safe default: how dense the glass is. */
  glassScale?: number
  /** A hue the person picked; null takes it from the picture. */
  accentHue?: number | null
}

/** The aurora has no picture to sample; it only needs the density knob. */
export function scaleTheme(theme: Theme, glassScale: number): Theme {
  const alpha = clamp(theme.glassAlpha * clamp(glassScale, 0.6, 1.5), 0.14, 0.55)
  return { ...theme, glassAlpha: alpha, vars: { ...theme.vars, '--glass-alpha': alpha.toFixed(3) } }
}

export function themeFromPixels(
  pixels: Uint8ClampedArray,
  options: ThemeOptions = {},
): Theme {
  const glassScale = clamp(options.glassScale ?? 1, 0.6, 1.5)
  const picked = options.accentHue ?? null
  const bins = new Array<number>(24).fill(0)
  const luminances: number[] = []
  let colorful = 0
  let total = 0

  for (let i = 0; i < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 255) < 128) continue
    const r = pixels[i]!
    const g = pixels[i + 1]!
    const b = pixels[i + 2]!
    total++
    luminances.push(0.2126 * r + 0.7152 * g + 0.0722 * b)
    const { h, s, l } = rgbToHsl(r, g, b)
    if (s < 0.12 || l < 0.12 || l > 0.9) continue
    colorful++
    bins[Math.floor(h / 15) % 24]! += s * (0.35 + 0.65 * (1 - Math.abs(l - 0.5) * 2))
  }

  // A black-and-white photograph has no hue to give; amber would be an invented colour.
  const monochrome = total > 0 && colorful / total < 0.02
  const hues: number[] = []
  if (!monochrome) {
    const peaks = bins
      .map((weight, index) => ({ hue: index * 15 + 7.5, weight }))
      .sort((a, b) => b.weight - a.weight)
    for (const peak of peaks) {
      if (peak.weight <= 0) break
      if (hues.every((hue) => hueGap(hue, peak.hue) >= 40)) hues.push(peak.hue)
      if (hues.length === 3) break
    }
  }

  const neutral = monochrome && picked === null
  let triad: number[]
  if (picked !== null) {
    triad = [picked, wrap(picked + 38), wrap(picked - 46)]
  } else if (hues.length > 0) {
    triad = [...hues]
    while (triad.length < 3) triad.push(wrap(triad[0]! + (triad.length === 1 ? 38 : -46)))
  } else {
    triad = [218, 205, 232]
  }
  const first = triad[0]!
  const second = triad[1]!
  const third = triad[2]!

  luminances.sort((a, b) => a - b)
  // p97, not the mean: a panel covers the bright part of the picture too.
  const high = luminances.length ? luminances[Math.floor(luminances.length * 0.97)]! : 60
  const bright = clamp(high / 255, 0, 1)
  const baseAlpha = clamp(0.24 + bright * 0.1, 0.24, 0.36)
  const glassAlpha = clamp(baseAlpha * glassScale, 0.14, 0.55)

  // Solve the backdrop dim from the mist colour: the glass must darken the picture enough for it.
  // Insets sit on the panel and add 5% white, so the whole palette is solved against that lighter
  // surface; the panel itself then has headroom.
  const mist: Hsl = neutral
    ? { h: first, s: 0.06, l: 0.8 }
    : { h: first, s: 0.12, l: 0.78 }
  const insetLight = 0.05
  const panelLimit = (brightestPassing(mist, 4.5) - 255 * insetLight) / (1 - insetLight)
  const glassDim = clamp(
    (panelLimit - DARK_FILL * glassAlpha) / ((1 - glassAlpha) * Math.max(high, 1)),
    0.3,
    0.95,
  )

  const compositeGray = high * glassDim * (1 - glassAlpha) + DARK_FILL * glassAlpha
  const insetGray = compositeGray * (1 - insetLight) + 255 * insetLight
  const composite: Hsl = { h: first, s: 0, l: insetGray / 255 }
  const surface = ensureContrast(mist, composite, 4.5)

  const accent = ensureContrast(
    { h: first, s: neutral ? 0.07 : 0.62, l: neutral ? 0.86 : 0.72 },
    composite,
    4.5,
  )
  const secondary = ensureContrast(
    { h: second, s: neutral ? 0.09 : 0.5, l: 0.73 },
    composite,
    4.5,
  )
  const tertiary = ensureContrast(
    { h: third, s: neutral ? 0.11 : 0.64, l: 0.78 },
    composite,
    4.5,
  )
  const info = ensureContrast({ h: third, s: neutral ? 0.12 : 0.72, l: 0.8 }, composite, 4.5)
  const error = ensureContrast({ h: 4, s: 0.46, l: 0.78 }, composite, 4.5)
  const ink: Hsl = { h: first, s: 0.16, l: 0.96 }
  const dim: Hsl = { h: first, s: 0.1, l: 0.62 }
  const glassBase = rgbTriplet({ h: first, s: neutral ? 0.1 : 0.22, l: 0.038 })
  const aurora = [
    hsl({ h: first, s: neutral ? 0.12 : 0.42, l: 0.56 }),
    hsl({ h: second, s: neutral ? 0.1 : 0.36, l: 0.5 }),
    hsl({ h: third, s: neutral ? 0.14 : 0.44, l: 0.58 }),
  ]

  return {
    accent,
    mist: surface,
    glassAlpha,
    glassDim,
    glassBase,
    hues: [first, second, third],
    vars: {
      '--amber': hsl(accent),
      '--mint': hsl(secondary),
      '--ice': hsl(tertiary),
      '--periwinkle': hsl(info),
      '--coral': hsl(error),
      '--ink': hsl(ink),
      '--mist': hsl(surface),
      '--dim': hsl(dim),
      '--aurora-indigo': aurora[0]!,
      '--aurora-teal': aurora[1]!,
      '--aurora-amber': aurora[2]!,
      '--glass-alpha': glassAlpha.toFixed(3),
      '--glass-dim': glassDim.toFixed(3),
      '--glass-base': glassBase,
    },
  }
}
