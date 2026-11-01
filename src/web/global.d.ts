export {}

declare global {
  interface Window {
    dashboard?: {
      quit: () => void
    }
  }
}
