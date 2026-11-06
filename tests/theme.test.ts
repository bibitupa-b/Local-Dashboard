import { describe, expect, test } from 'vitest'
import { contrastRatio, glassCompositeGray, rgbToHsl, themeFromPixels } from '../src/web/theme.js'

/** A flat wallpaper of the given colours, as the browser hands it back from a canvas. */
function pixels(colors: [number, number, number][], count = 640): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i++) {
    const [r, g, b] = colors[i % colors.length]!
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  return data
}

function hueOf(color: string): number {
  return Number(/hsl\((\d+)/.exec(color)?.[1] ?? -1)
}

describe('theme from a wallpaper', () => {
  test('takes the dominant hue of the picture as the accent', () => {
    const theme = themeFromPixels(pixels([[214, 150, 74]]))
    // Amber wallpaper, amber interface.
    expect(Math.abs(hueOf(theme.vars['--amber']!) - 30)).toBeLessThan(18)
    expect(theme.vars['--mint']).toMatch(/^hsl\(/)
    expect(theme.vars['--ice']).toMatch(/^hsl\(/)
  })

  test('keeps mist readable on an inset over the brightest possible picture', () => {
    const theme = themeFromPixels(pixels([[255, 255, 255]]))
    const panel = glassCompositeGray(255, theme)
    const inset = { h: 0, s: 0, l: (panel * 0.95 + 255 * 0.05) / 255 }
    expect(contrastRatio(theme.mist, inset)).toBeGreaterThanOrEqual(4.5)
    // The panel itself is darker than the inset, so it passes with room to spare.
    expect(contrastRatio(theme.mist, { h: 0, s: 0, l: panel / 255 })).toBeGreaterThan(4.5)
  })

  test('stays readable on a dark picture too, without dimming it much', () => {
    const theme = themeFromPixels(pixels([[10, 14, 26]]))
    const panel = glassCompositeGray(26, theme)
    const inset = { h: 0, s: 0, l: (panel * 0.95 + 255 * 0.05) / 255 }
    expect(contrastRatio(theme.mist, inset)).toBeGreaterThanOrEqual(4.5)
    expect(theme.glassDim).toBeGreaterThan(0.8)
  })

  test('a bright picture gets denser glass than a dark one', () => {
    const bright = themeFromPixels(pixels([[222, 214, 200]]))
    const dark = themeFromPixels(pixels([[24, 32, 48]]))
    expect(bright.glassAlpha).toBeGreaterThan(dark.glassAlpha)
    expect(bright.glassDim).toBeLessThan(dark.glassDim)
  })

  test('gives a monochrome picture a neutral palette instead of an invented amber', () => {
    const theme = themeFromPixels(pixels([[128, 128, 128]]))
    const match = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(theme.vars['--amber']!)!
    expect(Number(match[2])).toBeLessThanOrEqual(15)
    expect(hueOf(theme.vars['--amber']!)).toBeGreaterThanOrEqual(0)
    expect(theme.vars['--mint']).toMatch(/^hsl\(/)
    expect(theme.vars['--ice']).toMatch(/^hsl\(/)
  })

  test('a picked accent replaces the hue from the picture and keeps contrast', () => {
    const theme = themeFromPixels(pixels([[214, 150, 74]]), { accentHue: 205 })
    expect(hueOf(theme.vars['--amber']!)).toBe(205)
    const panel = glassCompositeGray(158, theme)
    const inset = { h: 0, s: 0, l: (panel * 0.95 + 255 * 0.05) / 255 }
    expect(contrastRatio(theme.accent, inset)).toBeGreaterThanOrEqual(4.5)
  })

  test('the density knob never breaks readability', () => {
    for (const scale of [0.6, 1, 1.5]) {
      const theme = themeFromPixels(pixels([[232, 232, 232]]), { glassScale: scale })
      const panel = glassCompositeGray(232, theme)
      const inset = { h: 0, s: 0, l: (panel * 0.95 + 255 * 0.05) / 255 }
      expect(contrastRatio(theme.mist, inset)).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('errors stay a pastel red whatever the wallpaper is', () => {
    const wallpapers: [number, number, number][] = [
      [30, 90, 200],
      [210, 160, 60],
      [90, 160, 110],
    ]
    for (const wallpaper of wallpapers) {
      const theme = themeFromPixels(pixels([wallpaper]))
      const match = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(theme.vars['--coral']!)!
      const hue = Number(match[1])
      const saturation = Number(match[2])
      const lightness = Number(match[3])
      expect(Math.min(hue, 360 - hue)).toBeLessThan(20)
      expect(saturation).toBeLessThanOrEqual(55)
      expect(lightness).toBeGreaterThanOrEqual(74)
    }
  })

  test('is deterministic and fills every token the interface reads', () => {
    const data = pixels([[40, 70, 120], [180, 120, 60], [90, 140, 100]])
    const first = themeFromPixels(data)
    const second = themeFromPixels(data)
    expect(first).toEqual(second)
    for (const token of [
      '--amber',
      '--mint',
      '--ice',
      '--periwinkle',
      '--coral',
      '--ink',
      '--mist',
      '--dim',
      '--aurora-indigo',
      '--aurora-teal',
      '--aurora-amber',
      '--glass-alpha',
      '--glass-dim',
    ]) {
      expect(first.vars[token]).toBeTruthy()
    }
  })
})
