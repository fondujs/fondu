import type { Page } from '@playwright/test'

// What the view-transition cases (e2e/transitions.spec.ts) hold on to. An init script wraps `document.startViewTransition`:
// React calls it when a transition commits with a <ViewTransition> in it, and the wrapper delays the `update` it gets
// (the commit itself: its DOM changes and its layout effects) until the case releases it, so that each phase can be
// held deterministically:
//   - preparing: `update` not called yet (`window.__vt.hold = true`, then `window.__vt.release()`)
//   - animating: `update` done, the animation running (the app's CSS makes it last 60 s when
//     `documentElement.dataset.vtSlow` is set; `window.__vt.current.skipTransition()` ends it)
// and it records what the case checks: each transition's types and its phase, where the page was scrolled as `update`
// returned, and each time the page was announced.

export interface Recorded {
  types: string[]
  phase: 'preparing' | 'held' | 'updating' | 'updated' | 'animating' | 'finished' | 'skipped'
  /** [scrollX, scrollY] as `update` returned */
  scrollAfterUpdate: [number, number] | null
  /** the types `:active-view-transition-type()` matched as `update` ran, where the browser has it */
  matched: string[]
}
export interface VtWindow {
  hold: boolean
  swipe: boolean
  release?: () => void
  current?: { skipTransition(): void }
  log: Recorded[]
  /** the title of the page, each time it was announced */
  announced: string[]
  /** every `unhandledrejection`, by its reason's message */
  rejections: string[]
}

/** `api: false`: the browser has no `document.startViewTransition`. `window.__vt.swipe = true`: the next popstate has `hasUAVisualTransition` */
export async function install(page: Page, { api = true } = {}) {
  await page.addInitScript(
    ({ api }) => {
      const w = window as unknown as { __vt: VtWindow; navigation?: unknown }
      const vt: VtWindow = (w.__vt = {
        hold: false,
        swipe: false,
        log: [],
        announced: [],
        rejections: [],
      })
      // every held `update` (a newer navigation starts one of its own): released together
      const waiting: (() => void)[] = []
      vt.release = () => waiting.splice(0).forEach((resolve) => resolve())
      const doc = Document.prototype as unknown as { startViewTransition?: Function }
      const original = doc.startViewTransition
      if (!api) delete doc.startViewTransition
      else if (original)
        doc.startViewTransition = function (this: Document, arg: unknown) {
          const options = (typeof arg === 'function' ? { update: arg } : arg) as {
            update: () => Promise<void> | void
            types?: string[]
          }
          const entry: Recorded = {
            types: [...(options.types ?? [])],
            phase: 'preparing',
            scrollAfterUpdate: null,
            matched: [],
          }
          vt.log.push(entry)
          const transition = original.call(this, {
            ...options,
            update: async () => {
              if (vt.hold) {
                entry.phase = 'held'
                await new Promise<void>((resolve) => waiting.push(resolve))
              }
              entry.phase = 'updating'
              await options.update()
              entry.scrollAfterUpdate = [scrollX, scrollY]
              for (const type of ['navigation-forward', 'navigation-back', 'navigation-replace'])
                try {
                  if (document.documentElement.matches(`:active-view-transition-type(${type})`))
                    entry.matched.push(type)
                } catch {}
              entry.phase = 'updated'
            },
          }) as ViewTransition
          transition.ready.then(
            () => (entry.phase = 'animating'),
            () => {},
          )
          transition.finished.then(
            () => (entry.phase = 'finished'),
            () => (entry.phase = 'skipped'),
          )
          vt.current = transition
          return transition
        }
      addEventListener('unhandledrejection', (event) =>
        vt.rejections.push(String((event.reason as Error)?.message ?? event.reason)),
      )
      // a swipe back: the browser animates it already, and says so
      addEventListener(
        'popstate',
        (event) => {
          if (vt.swipe) Object.defineProperty(event, 'hasUAVisualTransition', { value: true })
        },
        true,
      )
      // the announcer (aria-live): each time its text is set
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as Element
          if (target.getAttribute?.('aria-live') === 'assertive')
            vt.announced.push(target.textContent ?? '')
        }
      }).observe(document, { subtree: true, childList: true, characterData: true })
    },
    { api },
  )
}

export const log = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vt: VtWindow }).__vt.log)
export const announced = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vt: VtWindow }).__vt.announced)
