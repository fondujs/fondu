import {
  Component,
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot, hydrateRoot } from 'react-dom/client'

import { compare, decoded, layoutsOf, pageId, routePatterns } from '../paths.js'
import type { Flash, Shared } from '../types.js'
import {
  again,
  inBrowser,
  startNavigation,
  type PageObject,
  type PendingNavigation,
} from './navigation.js'
import { progressBar, type ProgressOptions } from './progress.js'

type Layout = ComponentType<{ children: ReactNode }>
type PageComponent = ComponentType<Record<string, unknown>>
type Loader = () => Promise<unknown>

const ROUTES = '/app/routes/'
const ERROR = '_error'

// set by the app's entry (the Vite plugin's): the pages and layouts of app/routes/, and the build's settings
let pages = new Map<string, Loader>()
let layoutModules: Record<string, Loader> = {}
// the pages in the server's order: segment by segment from the first
let routes: Array<{ id: string; pattern: string; segments: string[] }> = []

/** @internal The app's entry, written by the Vite plugin. In the browser it hydrates the server's page and starts navigating. */
export function __entry(
  pageModules: Record<string, Loader>,
  layouts: Record<string, Loader>,
  settings: { prerender: boolean; progress: ProgressOptions | false; viewTransitions: boolean },
) {
  pages = new Map(
    Object.entries(pageModules).map(([key, loader]) => [pageId(key.slice(ROUTES.length)), loader]),
  )
  layoutModules = layouts
  routes = [...pages.keys()]
    .filter((id) => !id.split('/').some((s) => s.startsWith('_')))
    .flatMap((id) =>
      routePatterns(id).map((path) => {
        const pattern = path.replace(/:(\w+)\*/g, ':$1{.+}')
        return { id, pattern, segments: pattern.split('/').filter(Boolean) }
      }),
    )
    .sort((a, b) => compare(a.pattern, b.pattern))
  if (typeof document !== 'undefined') start(settings)
}

const defaultOf = async (loader: Loader) => ((await loader()) as { default: never }).default

/** a page's component, and the `_layout.tsx` files of its directories it's drawn in, outermost first */
async function load(component: string): Promise<Shown['view']> {
  const page = pages.get(component)
  if (!page) throw new Error(`fondu: there is no page "${component}" in app/routes/`)
  const chain = layoutsOf(component)
    .map((dir) => `${ROUTES}${dir ? `${dir}/` : ''}_layout.tsx`)
    .filter((k) => k in layoutModules)
  const [Component, ...layouts] = await Promise.all([
    defaultOf(page) as Promise<PageComponent>,
    ...chain.map((k) => defaultOf(layoutModules[k]!) as Promise<Layout>),
  ])
  return { Component, layouts }
}

const PageContext = createContext<PageObject | null>(null)
type Shown = {
  page: PageObject
  view: { Component: PageComponent; layouts: Layout[] }
  mounts: number
  seq: number
}
// A state is built whole and nothing is computed from the one it replaces: an update can't be rebased onto an older page
let mountCount = 0
let seqCount = 0

/** @internal the state that puts a page on the screen: mounted anew (`fresh`), or keeping its state */
export const shownOf = (page: PageObject, view: Shown['view'], fresh: boolean): Shown => ({
  page,
  view,
  mounts: (mountCount += Number(fresh)),
  seq: ++seqCount,
})
/** @internal the update for a state: it keeps the newer one, whichever order they arrive in */
export const newer = (next: Shown) => (now: Shown) => (now.seq > next.seq ? now : next)
let mounted: ((show: Dispatch<SetStateAction<Shown>>) => void) | undefined

function App({ initial }: { initial: Shown }): ReactElement {
  const [{ page, view, mounts }, set] = useState(initial)
  useLayoutEffect(() => mounted?.(set), [set])
  const { Component, layouts } = view
  // the page mounted anew by each navigation, its layouts kept (the same components: React keeps them)
  // a page that throws in the browser: the error page in its place, in its layouts; a layout that throws: the error
  // page alone. Until the next page
  const content = layouts.reduceRight<ReactElement>(
    (children, L) => createElement(L, null, children),
    createElement(Failed, { key: mounts, page }, createElement(Component, { ...page.props })),
  )
  return createElement(
    PageContext.Provider,
    { value: page },
    createElement(Failed, { page }, content),
  )
}

/** the app's error page (routes/_error.tsx), loaded once the app starts: a failed render can't wait for it */
let ErrorPage: ComponentType<{ status: number }> | undefined

class Failed extends Component<
  { children?: ReactNode; page: PageObject },
  { failed: boolean; page: PageObject }
> {
  override state = { failed: false, page: this.props.page }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  static getDerivedStateFromProps(props: { page: PageObject }, state: { page: PageObject }) {
    return props.page === state.page ? null : { failed: false, page: props.page }
  }
  override render() {
    if (!this.state.failed) return this.props.children
    return ErrorPage
      ? createElement(Unfailing, null, createElement(ErrorPage, { status: 500 }))
      : PLAIN
  }
}

const PLAIN = 'Something went wrong'

// `Failed` renders the error page outside its own reach: an error page that throws would escape every boundary and React
// would unmount the app (a blank page). Plain text instead, and the error in the console.
class Unfailing extends Component<{ children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(error: unknown) {
    console.error('[fondu] the error page failed to render:', error)
  }
  override render() {
    return this.state.failed ? PLAIN : this.props.children
  }
}

/** @internal The page a URL is, by the server's order: the first pattern that matches. Only a guess (a param's listed values are the server's). */
export function pageAt(pathname: string): string | undefined {
  // decoded, as the server matches them (`/caf%C3%A9` is `café.tsx`)
  const parts = pathname.split('/').filter(Boolean).map(decoded)
  return routes.find(({ segments }) => {
    const rest = segments.at(-1)?.endsWith('{.+}')
    if (rest ? parts.length < segments.length : parts.length !== segments.length) return false
    return segments.every((s, i) => s.startsWith(':') || s === parts[i])
  })?.id
}

export type Navigation =
  | { state: 'idle'; to: null; form: null }
  | {
      /** `submitting`: a form's POST; `loading`: any other (a link, a GET form, `navigate()`, `reload()`) */
      state: 'loading' | 'submitting'
      to: string
      form: HTMLFormElement | null
    }
  | {
      /** a form's POST that could not be sent, or whose answer could not be read: the form stays, to send again */
      state: 'failed'
      to: string
      form: HTMLFormElement | null
    }

const IDLE: Navigation = { state: 'idle', to: null, form: null }
let navigation: Navigation = IDLE
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function setNavigation(next: PendingNavigation | null) {
  navigation = next
    ? {
        state: next.failed ? 'failed' : next.post ? 'submitting' : 'loading',
        to: next.to,
        form: next.form,
      }
    : IDLE
  for (const l of listeners) l()
}

function start(settings: Parameters<typeof __entry>[2]) {
  const progress = settings.progress
  if (progress)
    subscribe(
      progressBar(
        progress,
        () =>
          (navigation.state === 'loading' || navigation.state === 'submitting') &&
          (progress.forms !== false || navigation.form === null),
      ),
    )
  const data = document.querySelector('script[data-page="app"]')?.textContent
  const root = document.getElementById('app')
  if (!data || !root)
    throw new Error('fondu: the document has no page (script[data-page="app"], #app)')
  const initial = JSON.parse(data) as PageObject
  void pages
    .get(ERROR)?.()
    .then((m) => (ErrorPage = (m as { default: typeof ErrorPage }).default))
  void load(initial.component).then((view) => {
    // dev: the stylesheet the server gave the page until its layouts brought their CSS (they have now)
    document.querySelector('[data-fondu-dev-css]')?.remove()
    const app = createElement(App, { initial: { page: initial, view, mounts: 0, seq: 0 } })
    const hydrated = root.hasChildNodes()
    mounted = (set) => {
      mounted = undefined
      let loaded = { component: initial.component, view }
      startNavigation({
        initial,
        prerender: settings.prerender,
        viewTransitions: settings.viewTransitions,
        pending: setNavigation,
        preload(pathname) {
          const page = pageAt(pathname)
          if (page) load(page).catch(() => {})
        },
        isPage: (pathname) => pageAt(pathname) !== undefined,
        hydrated,
        async show(page, fresh, stale) {
          // The live page's modules are already here. Shared URLs must settle before the next native frame,
          // not wait for repeated import()s of the same component. No page props or React tree are cached here.
          const view =
            page.component === loaded.component ? loaded.view : await load(page.component)
          if (stale()) return
          return () => {
            loaded = { component: page.component, view }
            flushSync(() => set(newer(shownOf(page, view, fresh))))
          }
        },
      })
    }
    if (hydrated) hydrateRoot(root, app)
    else createRoot(root).render(app)
  })
}

export type Rendered = ReadableStream<Uint8Array> & { allReady: Promise<void> }

/**
 * @internal The server render of a page, streamed. The tree is the browser's (`<div id="app"><App/></div>`, nothing beside
 * it): `useId()` is the position in the tree, so a sibling of the page would make every id differ.
 */
export async function renderPage(
  page: PageObject,
  render: (element: ReactElement) => Promise<Rendered>,
): Promise<Rendered> {
  const view = await load(page.component)
  return render(
    createElement(
      'div',
      { id: 'app' },
      createElement(App, { initial: { page, view, mounts: 0, seq: 0 } }),
    ),
  )
}

/** a form's field errors, as a page gets them (its `errors` prop): field name → message */
export type Errors = Record<string, string>

export type Page<P = Shared> = {
  component: string
  props: P & { errors: Errors }
  url: string
  flash: Partial<Flash>
}

export function usePage<P = Shared>(): Page<P> {
  const page = useContext(PageContext)
  if (!page) throw new Error('fondu: usePage() is for components of a page')
  return page as never
}

/**
 * The navigation on its way: `state` is `idle`, `loading` or `submitting`, until the next page is on the screen. `failed`
 * is a form's POST that could not be sent: the form stays, to send again. A GET that fails loads as a document instead.
 */
export function useNavigation(): Navigation {
  return useSyncExternalStore(
    subscribe,
    () => navigation,
    () => IDLE,
  )
}

/** This page's props asked for again: the page keeps its state and the scroll position. */
export function reload() {
  inBrowser('reload')
  again()
}
