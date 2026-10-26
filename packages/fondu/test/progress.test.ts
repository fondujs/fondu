import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { progressBar } from '../src/client/progress.js'

// the DOM it uses, and no more: elements in a body, their style
type Bar = { style: Record<string, string>; isConnected: boolean; remove(): void }
let body: Bar[]

beforeEach(() => {
  vi.useFakeTimers()
  body = []
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 16))
  vi.stubGlobal('document', {
    createElement: () => {
      const bar: Bar = {
        style: {},
        get isConnected() {
          return body.includes(bar)
        },
        remove: () => void body.splice(body.indexOf(bar), 1),
      }
      return Object.assign(bar, { setAttribute: () => {} })
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
  test('shown after its delay, in its color, creeping; filled and gone once done', () => {
    let pending = true
    const update = progressBar({ delay: 100, color: 'red' }, () => pending)
    update()
    vi.advanceTimersByTime(100)
    expect(body).toHaveLength(1)
    const bar = body[0]!
    expect(bar.style.background).toBe('red')
    vi.advanceTimersByTime(1000)
    const crept = Number(/scaleX\(([\d.]+)\)/.exec(bar.style.transform!)![1])
    expect(crept).toBeGreaterThan(0.1)
    expect(crept).toBeLessThan(0.95)
    pending = false
    update()
    expect([bar.style.transform, bar.style.opacity]).toEqual(['scaleX(1)', '0'])
    vi.advanceTimersByTime(250)
    expect(body).toHaveLength(0)
  })
  test('one bar while a navigation is pending, however often it is told', () => {
    const update = progressBar({ delay: 0 }, () => true)
    update()
    update()
    vi.advanceTimersByTime(10)
    update()
    expect(body).toHaveLength(1)
  })
})
