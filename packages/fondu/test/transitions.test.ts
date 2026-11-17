import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// The browser's view transition around the client's commit (src/client/transitions.ts), with a stub of
// `document.startViewTransition` whose `update` the test calls when it wants
type Stub = {
  update: () => void
  types?: string[]
  ready: Promise<void>
  finished: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition: ReturnType<typeof vi.fn>
  fire(): void
}
let started: Stub[]
let unhandled: unknown[]
const onUnhandled = (reason: unknown) => unhandled.push(reason)

async function load(typed = true) {
  vi.resetModules()
  vi.stubGlobal('CSS', { supports: () => typed })
  vi.stubGlobal('document', {
    documentElement: { style: { scrollBehavior: 'smooth' } },
    startViewTransition(arg: unknown) {
      const { update, types } = (typeof arg === 'function' ? { update: arg } : arg) as {
        update: () => void
        types?: string[]
      }
      const stub = {} as Stub
      let reject!: (e: unknown) => void
      let resolve!: () => void
      stub.update = update
      stub.types = types
      stub.ready = Promise.reject(new Error('skipped'))
      stub.finished = new Promise<void>((_, r) => (reject = r))
      stub.updateCallbackDone = new Promise<void>((res, rej) => {
        resolve = res
        stub.fire = () => {
          try {
            update()
            resolve()
          } catch (error) {
            rej(error)
            reject(error)
          }
        }
      })
      stub.skipTransition = vi.fn()
      started.push(stub)
      return stub
    },
  })
  return import('../src/client/transitions.js')
}

beforeEach(() => {
  started = []
  unhandled = []
  process.on('unhandledRejection', onUnhandled)
})
afterEach(() => {
  process.off('unhandledRejection', onUnhandled)
  vi.unstubAllGlobals()
})
const settle = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('transition()', () => {
  test('the object form with types where the browser has them, the function form without', async () => {
    const typed = await load(true)
    void typed.transition(() => {}, ['navigation-back'])
    expect(started[0]!.types).toEqual(['navigation-back'])
    started = []
    const plain = await load(false)
    void plain.transition(() => {}, ['navigation-back'])
    expect(started[0]!.types).toBeUndefined()
    expect(typeof started[0]!.update).toBe('function')
  })

  test('settles once the update has run; a skip and a failed update leave no unhandled rejection', async () => {
    const t = await load()
    const ran = vi.fn()
    const done = t.transition(ran, [])
    expect(ran).not.toHaveBeenCalled()
    started[0]!.fire()
    await done
    expect(ran).toHaveBeenCalledOnce()
    await settle()
    expect(unhandled).toEqual([])
  })

  test('an update that throws rejects what is awaited, as a render error does without a transition', async () => {
    const t = await load()
    const done = t.transition(() => {
      throw new Error('render failed')
    }, [])
    started[0]!.fire()
    await expect(done).rejects.toThrow('render failed')
    await settle()
    expect(unhandled).toEqual([])
  })

  test('the update is given a way to skip its own transition', async () => {
    const t = await load()
    let skipped = false
    const done = t.transition((skip) => {
      skip()
      skipped = true
    }, [])
    started[0]!.fire()
    await done
    expect(skipped).toBe(true)
    expect(started[0]!.skipTransition).toHaveBeenCalledOnce()
  })

  test('skipActive() skips the one on its way, and only that', async () => {
    const t = await load()
    t.skipActive() // none yet
    const done = t.transition(() => {}, [])
    t.skipActive()
    expect(started[0]!.skipTransition).toHaveBeenCalledOnce()
    started[0]!.fire()
    await done
    await settle() // finished: `active` is cleared
  })

  test('instantly() runs the update with smooth scrolling off, and puts it back, also if it throws', async () => {
    const t = await load()
    const style = document.documentElement.style
    let during = ''
    t.instantly(() => (during = style.scrollBehavior))
    expect(during).toBe('auto')
    expect(style.scrollBehavior).toBe('smooth')
    expect(() =>
      t.instantly(() => {
        throw new Error('x')
      }),
    ).toThrow('x')
    expect(style.scrollBehavior).toBe('smooth')
  })

  test('a data-transition attribute: none, opted out, or the custom types it adds', async () => {
    const { optIn } = await load()
    expect(optIn(null)).toBeUndefined()
    expect(optIn('')).toEqual([])
    expect(optIn('zoom')).toEqual(['zoom'])
    expect(optIn('zoom fade')).toEqual(['zoom', 'fade'])
    expect(optIn('  zoom \n\t fade  ')).toEqual(['zoom', 'fade'])
    // JSX: `<a data-transition>` is rendered as `data-transition="true"`
    expect(optIn('true')).toEqual([])
    expect(optIn('false')).toBe(false)
    expect(optIn(' false ')).toBe(false)
    // only the whole value opts out
    expect(optIn('zoom false')).toEqual(['zoom', 'false'])
    expect(optIn('zoom true')).toEqual(['zoom', 'true'])
  })
})
