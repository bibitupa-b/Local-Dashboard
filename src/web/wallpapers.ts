export type WallpaperId =
  | 'aurora'
  | 'blue-hour'
  | 'cinnabar-shore'
  | 'still-sea'
  | 'dusk-ridge'
  | 'alpine-dawn'
  | 'salt-mirror'
  | 'pine-hollow'
  | 'amber-dunes'
  | 'heather-moor'

export type Wallpaper = {
  id: WallpaperId
  title: string
  full?: string
  thumb?: string
}

const wallpaper = (id: Exclude<WallpaperId, 'aurora'>, title: string): Wallpaper => ({
  id,
  title,
  full: `/wallpapers/${id}.jpg`,
  thumb: `/wallpapers/thumbs/${id}.webp`,
})

export const WALLPAPERS: Wallpaper[] = [
  { id: 'aurora', title: 'Aurora' },
  wallpaper('blue-hour', 'Blue Hour'),
  wallpaper('cinnabar-shore', 'Cinnabar Shore'),
  wallpaper('still-sea', 'Still Sea'),
  wallpaper('dusk-ridge', 'Dusk Ridge'),
  wallpaper('alpine-dawn', 'Alpine Dawn'),
  wallpaper('salt-mirror', 'Salt Mirror'),
  wallpaper('pine-hollow', 'Pine Hollow'),
  wallpaper('amber-dunes', 'Amber Dunes'),
  wallpaper('heather-moor', 'Heather Moor'),
]

export function wallpaperById(id: string | undefined): Wallpaper {
  return WALLPAPERS.find((item) => item.id === id) ?? WALLPAPERS[0]!
}
