// `"true"` is a bare attribute: React writes `data-transition` as `data-transition="true"`
export function optIn(value: string | null): string[] | false | undefined {
  if (value === null) return
  const types = value.match(/\S+/g) ?? []
  const only = types.join()
  return only === 'false' ? false : only === 'true' ? [] : types
}

type ViewTransition = {
  ready: Promise<void>
  finished: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition(): void
}

let active: ViewTransition | undefined

export const canTransition = () =>
  typeof (document as { startViewTransition?: unknown }).startViewTransition === 'function'

// `update` runs when the browser has captured the old page, and also when the transition is skipped. Types are set only
// where the browser has them (`:active-view-transition-type()`).
export function transition(update: (skip: () => void) => void, types: string[]): Promise<void> {
  const run = () => update(() => view.skipTransition())
  const typed = CSS.supports('selector(:active-view-transition-type(a))')
  const view = (
    document as unknown as { startViewTransition(a: unknown): ViewTransition }
  ).startViewTransition(typed ? { update: run, types } : run)
  active = view
  // `ready` rejects on skip, and `finished` when `update` throws: the latter reaches the caller through `updateCallbackDone`
  view.ready.catch(() => {})
  const over = () => {
    if (active === view) active = undefined
  }
  view.finished.then(over, over)
  return view.updateCallbackDone
}

export const skipActive = () => active?.skipTransition()

// smooth scrolling off, so the new page's snapshot is taken at the scroll position
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
