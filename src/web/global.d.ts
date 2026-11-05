export {}

declare global {
  interface Window {
    dashboard?: {
      quit: () => void
      openDataFolder: () => void
      minimize: () => void
      toggleMaximize: () => void
      close: () => void
    }
  }
}
