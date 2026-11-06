/**
 * One list for the server, the settings screen and the theme: the id is the file name under
 * `assets/wallpapers`, and the server refuses anything that is not here.
 */
export const WALLPAPER_IDS = [
  'aurora',
  'woodpile-morning',
  'crescent-planet',
  'autumn-pavilion',
  'rainy-veranda',
  'dusk-rider',
  'rider-at-dawn',
  'digital-touch',
  'night-clouds',
  'fog-field',
  'frozen-creek',
  'gorge-falls',
  'rust-giants',
  'blue-summit',
  'bliss-night',
  'harbour-town',
  'forest-cabin',
  'glass-bloom',
  'glacier-peak',
  'block-genesis',
  'valley-road',
  'lily-pond',
  'white-dove',
  'silk-layers',
  'ringed-earth',
  'tulip-dark',
  'canyon-river',
  'crimson-knight',
] as const

export type WallpaperId = (typeof WALLPAPER_IDS)[number]
