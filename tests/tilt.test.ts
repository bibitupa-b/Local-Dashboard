// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { initTilt, tiltTargetFor } from '../src/web/tilt.js'

function mount() {
  document.body.innerHTML = `
    <div class="card" id="card">
      <p id="text">Briefing</p>
      <button id="button">Sync</button>
      <div class="conn-actions"><button id="inner">Test</button></div>
    </div>
    <div class="today" id="today"><span id="event">Standup</span></div>
    <button id="outside">Settings</button>
  `
  return {
    card: document.getElementById('card')!,
    text: document.getElementById('text')!,
    button: document.getElementById('button')!,
    inner: document.getElementById('inner')!,
    today: document.getElementById('today')!,
    event: document.getElementById('event')!,
    outside: document.getElementById('outside')!,
  }
}

function move(target: Element) {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  target.dispatchEvent(event)
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

test('tilt skips controls and only targets cards', () => {
  const el = mount()
  expect(tiltTargetFor(el.button)).toBeNull()
  expect(tiltTargetFor(el.inner)).toBeNull()
  expect(tiltTargetFor(el.outside)).toBeNull()
  expect(tiltTargetFor(el.text)).toBe(el.card)
  expect(tiltTargetFor(el.event)).toBe(el.today)
})

test('tilt waits for the pointer to settle and ignores quick passes', () => {
  vi.useFakeTimers()
  const el = mount()
  initTilt()

  move(el.button)
  vi.advanceTimersByTime(200)
  expect(el.card.classList.contains('tilting')).toBe(false)

  move(el.text)
  vi.advanceTimersByTime(100)
  expect(el.card.classList.contains('tilting')).toBe(false)

  move(document.body)
  vi.advanceTimersByTime(200)
  expect(el.card.classList.contains('tilting')).toBe(false)

  move(el.text)
  vi.advanceTimersByTime(200)
  expect(el.card.classList.contains('tilting')).toBe(true)

  move(el.button)
  expect(el.card.classList.contains('tilting')).toBe(false)
})
