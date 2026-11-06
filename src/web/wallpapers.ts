import type { WallpaperId } from '../shared/wallpaper-ids.js'

export type { WallpaperId }

export type Wallpaper = {
  id: WallpaperId
  title: string
  full?: string
  thumb?: string
  /** Where the subject sits in the frame; the room anchors its crop there. */
  focus?: string
  zoom?: number
}

const wallpaper = (id: Exclude<WallpaperId, 'aurora'>, title: string, focus: string, zoom: number): Wallpaper => ({
  id,
  title,
  full: `/wallpapers/${id}.jpg`,
  thumb: `/wallpapers/thumbs/${id}.jpg`,
  focus,
  zoom,
})

export const WALLPAPERS: Wallpaper[] = [
  { id: 'aurora', title: 'Aurora' },
  wallpaper('woodpile-morning', 'Woodpile Morning', '55% 55%', 1.08),
  wallpaper('crescent-planet', 'Crescent Planet', '70% 48%', 1),
  wallpaper('autumn-pavilion', 'Autumn Pavilion', '50% 55%', 1.05),
  wallpaper('rainy-veranda', 'Rainy Veranda', '60% 55%', 1.05),
  wallpaper('dusk-rider', 'Dusk Rider', '62% 55%', 1.12),
  wallpaper('rider-at-dawn', 'Rider at Dawn', '45% 52%', 1.05),
  wallpaper('digital-touch', 'Digital Touch', '50% 50%', 1),
  wallpaper('night-clouds', 'Night Clouds', '50% 58%', 1.05),
  wallpaper('fog-field', 'Fog Field', '50% 70%', 1.1),
  wallpaper('frozen-creek', 'Frozen Creek', '50% 58%', 1.05),
  wallpaper('gorge-falls', 'Gorge Falls', '45% 55%', 1.05),
  wallpaper('rust-giants', 'Rust Giants', '58% 55%', 1.05),
  wallpaper('blue-summit', 'Blue Summit', '50% 45%', 1.08),
  wallpaper('bliss-night', 'Bliss Night', '50% 62%', 1.05),
  wallpaper('harbour-town', 'Harbour Town', '55% 45%', 1.05),
  wallpaper('forest-cabin', 'Forest Cabin', '55% 60%', 1.08),
  wallpaper('glass-bloom', 'Glass Bloom', '50% 50%', 1.02),
  wallpaper('glacier-peak', 'Glacier Peak', '50% 42%', 1.05),
  wallpaper('block-genesis', 'Block Genesis', '50% 45%', 1),
  wallpaper('valley-road', 'Valley Road', '55% 55%', 1.06),
  wallpaper('lily-pond', 'Lily Pond', '50% 50%', 1.06),
  wallpaper('white-dove', 'White Dove', '50% 50%', 1),
  wallpaper('silk-layers', 'Silk Layers', '55% 50%', 1.04),
  wallpaper('ringed-earth', 'Ringed Earth', '35% 45%', 1.05),
  wallpaper('tulip-dark', 'Tulip Dark', '38% 50%', 1.08),
  wallpaper('canyon-river', 'Canyon River', '55% 50%', 1.05),
  wallpaper('crimson-knight', 'Crimson Knight', '28% 55%', 1.1),
]

export function wallpaperById(id: string | undefined): Wallpaper {
  return WALLPAPERS.find((item) => item.id === id) ?? WALLPAPERS[0]!
}
