import { expect, test } from 'vitest'
import { DEFAULT_WIDGET_LAYOUT, normalizeWidgetLayout } from '../src/shared/widgets.js'

test('a missing or broken layout falls back to three visible widgets', () => {
  expect(normalizeWidgetLayout(null)).toEqual(DEFAULT_WIDGET_LAYOUT)
  expect(normalizeWidgetLayout([{ id: 'now-next', slot: 'moon', order: 'x' }])).toEqual(
    DEFAULT_WIDGET_LAYOUT,
  )
})

test('unknown widgets are dropped and a missing one is added', () => {
  const layout = normalizeWidgetLayout([
    { id: 'open-loops', slot: 'left', order: 0 },
    { id: 'nope', slot: 'right', order: 0 },
  ])
  expect(layout.map((item) => item.id).sort()).toEqual([
    'deepseek-week',
    'now-next',
    'open-loops',
  ])
  expect(layout.find((item) => item.id === 'open-loops')?.slot).toBe('left')
})

test('order is unique inside a column and free across columns', () => {
  const layout = normalizeWidgetLayout([
    { id: 'now-next', slot: 'left', order: 0 },
    { id: 'open-loops', slot: 'left', order: 0 },
    { id: 'deepseek-week', slot: 'right', order: 0 },
  ])
  const left = layout.filter((item) => item.slot === 'left').sort((a, b) => a.order - b.order)
  const right = layout.filter((item) => item.slot === 'right')
  expect(left.map((item) => item.order)).toEqual([0, 1])
  expect(right[0]?.order).toBe(0)
})
import { changeWidget } from '../src/web/Widgets.js'

test('moving a widget appends it to the target column', () => {
  const layout = changeWidget(DEFAULT_WIDGET_LAYOUT, 'open-loops', { slot: 'left' })
  const left = layout.filter((item) => item.slot === 'left').sort((a, b) => a.order - b.order)
  expect(left.map((item) => item.id)).toEqual(['now-next', 'open-loops'])
  expect(left[1]?.order).toBe(1)
  expect(layout.find((item) => item.id === 'deepseek-week')?.slot).toBe('right')
})
