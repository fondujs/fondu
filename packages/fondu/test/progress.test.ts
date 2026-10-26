import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { progressBar } from '../src/client/progress.js'

// the DOM it uses, and no more: elements in a body, their style
type Bar = { style: Record<string, string>; remove(): void }
let body: Bar[]
let pagehide: () => void

beforeEach(() => {
  vi.useFakeTimers()
  body = []
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('addEventListener', (_: 'pagehide', listener: () => void) => (pagehide = listener))
  vi.stubGlobal('document', {
    createElement: () => {
      const bar: Bar = { style: {}, remove: () => void body.splice(body.indexOf(bar), 1) }
      return Object.assign(bar, { setAttribute: () => {}, getBoundingClientRect: () => ({}) })
    },
    body: { append: (bar: Bar) => body.push(bar) },
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the progress bar', () => {
  test('none for a navigation quicker than its delay', () => {
    let pending = true
    const update = progressBar({}, () => pending)
    update()
    vi.advanceTimersByTime(200)
    pending = false
    update()
    vi.advanceTimersByTime(1000)
    expect(body).toHaveLength(0)
  })
  test('shown after its delay, in its color, growing from 0; filled and gone once done', () => {
    let pending = true
    const update = progressBar({ delay: 100, color: 'red' }, () => pending)
    update()
    vi.advanceTimersByTime(99)
    expect(body).toHaveLength(0)
    vi.advanceTimersByTime(1)
    const bar = body[0]!
    expect(bar.style.background).toBe('red')
    // one long transition from 0 (computed before it is set) towards the end
    expect([bar.style.transform, bar.style.transition]).toEqual([
      'scaleX(0.95)',
      'transform 10s cubic-bezier(0.05, 0.7, 0.1, 1)',
    ])
    pending = false
    update()
    // filled, then faded out
    expect([bar.style.transform, bar.style.opacity]).toEqual(['scaleX(1)', '0'])
    expect(bar.style.transition).toBe('transform 200ms ease-out, opacity 200ms 200ms')
    vi.advanceTimersByTime(449)
    expect(body).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(body).toHaveLength(0)
  })
  test('reduced motion: a still bar', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const update = progressBar({ delay: 0 }, () => true)
    update()
    vi.advanceTimersByTime(0)
    expect([body[0]!.style.transform, body[0]!.style.transition]).toEqual(['scaleX(1)', undefined])
  })
  test('one bar while a navigation is pending, however often it is told', () => {
    const update = progressBar({ delay: 0 }, () => true)
    update()
    update()
    vi.advanceTimersByTime(10)
    update()
    expect(body).toHaveLength(1)
  })
  test('none left when the document is left (the back/forward cache), the one fading out neither', () => {
    let pending = true
    const update = progressBar({ delay: 0 }, () => pending)
    update()
    vi.advanceTimersByTime(0)
    pending = false
    update()
    pending = true
    update()
    vi.advanceTimersByTime(0)
    expect(body).toHaveLength(2)
    pagehide()
    expect(body).toHaveLength(0)
  })
})
