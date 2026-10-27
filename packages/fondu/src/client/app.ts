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

import { layoutsOf, pageId, routePatterns } from '../paths.js'
import type { Flash, Shared } from '../types.js'
import { again, startNavigation, type Page } from './navigation.js'
import { progressBar, type ProgressOptions } from './progress.js'

type Layout = ComponentType<{ children: ReactNode }>
type PageComponent = ComponentType<Record<string, unknown>>
type Loader = () => Promise<unknown>

const ROUTES = '/app/routes/'
const ERROR = '_error'

// set by the app's entry (the Vite plugin's): the pages and layouts of app/routes/, and the build's settings
let pages = new Map<string, Loader>()
let layoutModules: Record<string, Loader> = {}

/**
 * @internal the app's entry (the Vite plugin writes it), in the browser and for the server render: `import.meta.glob`
 * of the pages and layouts of `app/routes/`, and `fondu({ prerender, progress })`. In the browser it starts the app:
 * it hydrates the server's page and starts navigating.
 */
export function __entry(
  pageModules: Record<string, Loader>,
  layouts: Record<string, Loader>,
  settings: { prerender: boolean; progress: ProgressOptions | false },
) {
  pages = new Map(
    Object.entries(pageModules).map(([key, loader]) => [pageId(key.slice(ROUTES.length)), loader]),
  )
  layoutModules = layouts
  if (typeof document !== 'undefined') start(settings)
}

const defaultOf = async (loader: Loader) => ((await loader()) as { default: never }).default

/** a page's component, and the `_layout.tsx` files of its directories it's drawn in, outermost first */
async function load(component: string): Promise<Shown['view']> {
  const page = pages.get(component)
  if (!page) throw new Error(`fondu: there is no page "${component}" in app/routes/`)
  const chain = layoutsOf(component)
    .map((dir) =>
      ['tsx', 'jsx']
        .map((ext) => `${ROUTES}${dir ? `${dir}/` : ''}_layout.${ext}`)
        .find((k) => k in layoutModules),
    )
    .filter((k) => k !== undefined)
  const [Component, ...layouts] = await Promise.all([
    defaultOf(page) as Promise<PageComponent>,
    ...chain.map((k) => defaultOf(layoutModules[k]!) as Promise<Layout>),
  ])
  return { Component, layouts }
}

// ---- the page on screen, for usePage()

const PageContext = createContext<Page | null>(null)
type Shown = { page: Page; view: { Component: PageComponent; layouts: Layout[] }; mounts: number }
/** the browser's: called once the app is on the screen, with what puts another page there */
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

/** what failed to render, until another page (the layouts it is around are kept: no key) */
class Failed extends Component<
  { children?: ReactNode; page: Page },
  { failed: boolean; page: Page }
> {
  override state = { failed: false, page: this.props.page }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  static getDerivedStateFromProps(props: { page: Page }, state: { page: Page }) {
    return props.page === state.page ? null : { failed: false, page: props.page }
  }
  override render() {
    if (!this.state.failed) return this.props.children
    return ErrorPage ? createElement(ErrorPage, { status: 500 }) : 'Something went wrong'
  }
}

/**
 * @internal The page a URL most likely is, by its route file's patterns (static segments first): its modules load with its
 * data, and a link to a URL that is none (a file, an HTTP route) is left to the browser. Only a guess (a param's
 * listed values are the server's), so the page shown is the one the server says.
 */
export function pageAt(pathname: string): string | undefined {
  const parts = pathname.split('/').filter(Boolean)
  let best: { id: string; score: number } | undefined
  for (const id of pages.keys()) {
    if (id.split('/').some((s) => s.startsWith('_'))) continue
    for (const pattern of routePatterns(id)) {
      const segments = pattern.split('/').filter(Boolean)
      let score = 0
      let i = 0
      for (const s of segments) {
        const part = parts[i]
        if (part === undefined) score = -1
        else if (s.endsWith('{.+}')) score += 1 // a catch-all: the rest
        else if (s.startsWith(':')) score += 2
        else score += s === part ? 3 : -Infinity
        i = s.endsWith('{.+}') ? parts.length : i + 1
        if (score < 0) break
      }
      if (score >= 0 && i === parts.length && (!best || score > best.score)) best = { id, score }
    }
  }
  return best?.id
}

// ---- pending navigations, for useNavigation()

/** a navigation on its way, or none: `useNavigation()` */
export type Navigation =
  | { state: 'idle'; to: null; form: null }
  | {
      /** `submitting`: a form's POST; `loading`: any other (a link, a GET form, `navigate()`, `reload()`) */
      state: 'loading' | 'submitting'
      /** where to: a path, its query and fragment (`/users/7?tab=posts`) */
      to: string
      /** the form being sent (a GET form's too), else null */
      form: HTMLFormElement | null
    }

const IDLE: Navigation = { state: 'idle', to: null, form: null }
let navigation: Navigation = IDLE
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function setNavigation(next: { to: string; form: HTMLFormElement | null; post: boolean } | null) {
  navigation = next
    ? { state: next.post ? 'submitting' : 'loading', to: next.to, form: next.form }
    : IDLE
  for (const l of listeners) l()
}

// ---- the app

/** the browser's app: the server's page hydrated, then navigations */
function start(settings: { prerender: boolean; progress: ProgressOptions | false }) {
  const progress = settings.progress
  if (progress)
    subscribe(
      progressBar(
        progress,
        () => navigation.state !== 'idle' && (progress.forms !== false || navigation.form === null),
      ),
    )
  const data = document.querySelector('script[data-page="app"]')?.textContent
  const root = document.getElementById('app')
  if (!data || !root)
    throw new Error('fondu: the document has no page (script[data-page="app"], #app)')
  const initial = JSON.parse(data) as Page
  void pages
    .get(ERROR)?.()
    .then((m) => (ErrorPage = (m as { default: typeof ErrorPage }).default))
  void load(initial.component).then((view) => {
    // dev: the stylesheet the server gave the page until its layouts brought their CSS (they have now)
    document.querySelector('[data-fondu-dev-css]')?.remove()
    const app = createElement(App, { initial: { page: initial, view, mounts: 0 } })
    const hydrated = root.hasChildNodes() // rendered on the server
    // navigations start once the page is on the screen (hydrated)
    mounted = (set) => {
      mounted = undefined
      startNavigation({
        initial,
        prerender: settings.prerender,
        pending: setNavigation,
        preload(pathname) {
          const page = pageAt(pathname)
          if (page) load(page).catch(() => {})
        },
        isPage: (pathname) => pageAt(pathname) !== undefined,
        hydrated,
        async show(page, fresh, stale) {
          const view = await load(page.component)
          if (stale()) return
          flushSync(() => set((now) => ({ page, view, mounts: now.mounts + Number(fresh) })))
        },
      })
    }
    if (hydrated) hydrateRoot(root, app)
    else createRoot(root).render(app)
  })
}

/** @internal the server render of a page: the head tags its components render (`<title>`…), and `<div id="app">` */
export async function renderPage(
  page: Page,
  renderToString: (element: ReactElement) => string,
): Promise<{ head: string; body: string }> {
  const view = await load(page.component)
  const html = renderToString(
    createElement('div', { id: 'app' }, createElement(App, { initial: { page, view, mounts: 0 } })),
  )
  // React puts the tags it hoists (`<title>`, `<meta>`, `<link>`) before the root's markup
  const at = html.indexOf('<div id="app"')
  return { head: html.slice(0, at), body: html.slice(at) }
}

/** a form's field errors, as a page gets them (its `errors` prop): field name → message */
export type Errors = Record<string, string>

/** the page on screen: its props (the shared ones, `errors`), its URL, its flash data */
export function usePage<P = Shared>(): {
  component: string
  props: P & { errors: Errors }
  url: string
  flash: Partial<Flash>
} {
  const page = useContext(PageContext)
  if (!page) throw new Error('fondu: usePage() is for components of a page')
  return page as never
}

/**
 * The navigation on its way: `state` is `idle`, `loading` (a link, `navigate()`…) or `submitting` (a form's POST),
 * from the click or the submit until the next page is on the screen; `to`, where to; `form`, the form being sent.
 */
export function useNavigation(): Navigation {
  return useSyncExternalStore(
    subscribe,
    () => navigation,
    () => IDLE,
  )
}

/** this page's props asked for again: the page keeps its state and the scroll position */
export function reload() {
  again()
}
