// View transitions: the browser's, around the client's own commit (the `viewTransitions` option, off by default).

declare const __FONDU_VIEW_TRANSITIONS__: boolean | undefined

/**
 * The `viewTransitions` option: a constant set at build time (Vite's `define`), so that the code behind it is gone from a
 * build that has it off. `false` where nothing defines it (a test, a build without the plugin)
 */
export const viewTransitions: boolean =
  typeof __FONDU_VIEW_TRANSITIONS__ === 'undefined' ? false : __FONDU_VIEW_TRANSITIONS__

type ViewTransition = {
  ready: Promise<void>
  finished: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition(): void
}

/** the view transition that is running: the document has one at a time */
let active: ViewTransition | undefined

/** the browser has view transitions */
export const canTransition = () =>
  typeof (document as { startViewTransition?: unknown }).startViewTransition === 'function'

/**
 * `update` (the commit and what follows it) inside `document.startViewTransition`, given a way to skip the transition;
 * settles when it has run, and rejects if it threw (a render error surfaces as it does without a transition). With
 * types where the browser has them (`:active-view-transition-type()`, tested as TanStack Router's `startViewTransition`
 * does), without them otherwise. `update` runs when the browser has captured the old page, and also when the
 * transition is skipped
 */
export function transition(update: (skip: () => void) => void, types: string[]): Promise<void> {
  const run = () => update(() => view.skipTransition())
  const typed = CSS.supports('selector(:active-view-transition-type(a))')
  const view = (
    document as unknown as { startViewTransition(a: unknown): ViewTransition }
  ).startViewTransition(typed ? { update: run, types } : run)
  active = view
  // `ready` rejects when the transition is skipped, `finished` when `update` throws: the latter reaches the caller
  // through `updateCallbackDone`
  view.ready.catch(() => {})
  const over = () => {
    if (active === view) active = undefined
  }
  view.finished.then(over, over)
  return view.updateCallbackDone
}

/** a newer navigation (Back, Forward) skips the transition on its way */
export const skipActive = () => active?.skipTransition()

/** `update` with the page's `scroll-behavior: smooth` off: the new page's snapshot is taken at the scroll position */
export function instantly(update: () => void) {
  const style = document.documentElement.style
  const was = style.scrollBehavior
  style.scrollBehavior = 'auto'
  try {
    update()
  } finally {
    style.scrollBehavior = was
  }
}
