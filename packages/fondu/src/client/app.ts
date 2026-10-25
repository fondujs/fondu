import {
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

import { layoutsOf } from '../paths.js'
import type { Flash, Shared } from '../types.js'
import { again, go, startNavigation, type Page } from './navigation.js'

type Layout = ComponentType<{ children: ReactNode }>
type PageComponent = ComponentType<Record<string, unknown>> & { layout?: Layout | Layout[] }
type Loader = () => Promise<unknown>

export interface AppOptions {
  /** the layout of a page with no `_layout.tsx` above it (and no `layout` of its own) */
  layout?: Layout
}

// set by the client entry's transform (the Vite plugin): the page and layout modules, and the build's settings
let modules: Record<string, Loader> = {}
let layoutModules: Record<string, Loader> = {}
let settings = { prerender: false }
let options: AppOptions = {}

/** @internal the Vite plugin's: `import.meta.glob` of `app/pages/` and its layouts, and `fondu({ prerender })` */
export function __entry(
  pages: Record<string, Loader>,
  layouts: Record<string, Loader>,
  set: { prerender: boolean },
) {
  modules = pages
  layoutModules = layouts
  settings = set
}

const defaultOf = async (loader: Loader) => ((await loader()) as { default: never }).default

/**
 * A page's component, and the layouts it's drawn in, outermost first: its own (`Page.layout`), or the `_layout.tsx`
 * files of its directories, or the app's (`startApp({ layout })`)
 */
async function load(component: string): Promise<Shown['view']> {
  const key = ['tsx', 'jsx', 'mdx']
    .map((ext) => `/app/pages/${component}.${ext}`)
    .find((k) => k in modules)
  if (!key) throw new Error(`fondu: there is no page "${component}" in app/pages/`)
  const chain = layoutsOf(component)
    .map((dir) =>
      ['tsx', 'jsx']
        .map((ext) => `/app/pages/${dir ? `${dir}/` : ''}_layout.${ext}`)
        .find((k) => k in layoutModules),
    )
    .filter((k) => k !== undefined)
  const [Component, ...layouts] = await Promise.all([
    defaultOf(modules[key]!) as Promise<PageComponent>,
    ...chain.map((k) => defaultOf(layoutModules[k]!) as Promise<Layout>),
  ])
  const own = Component.layout ?? (layouts.length ? layouts : options.layout)
  return { Component, layouts: own === undefined ? [] : Array.isArray(own) ? own : [own] }
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
  const content = layouts.reduceRight<ReactElement>(
    (children, L) => createElement(L, null, children),
    createElement(Component, { key: mounts, ...page.props }),
  )
  return createElement(PageContext.Provider, { value: page }, content)
}

// ---- pending navigations, for useNavigating()

let navigating = false
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function setNavigating(value: boolean) {
  navigating = value
  for (const l of listeners) l()
}

// ---- the API

/**
 * `app/app.tsx`: the app, in the browser (it hydrates the server's page and starts navigating) and for the server
 * render. Pages are the files in `app/pages/` ('users/show' is pages/users/show.tsx).
 */
export function startApp(app: AppOptions = {}) {
  options = app
  if (typeof document === 'undefined') return // the server: renderPage() below
  const data = document.querySelector('script[data-page="app"]')?.textContent
  const root = document.getElementById('app')
  if (!data || !root)
    throw new Error('fondu: the document has no page (script[data-page="app"], #app)')
  const initial = JSON.parse(data) as Page
  void load(initial.component).then((view) => {
    const app = createElement(App, { initial: { page: initial, view, mounts: 0 } })
    // navigations start once the page is on the screen (hydrated)
    mounted = (set) => {
      mounted = undefined
      startNavigation({
        initial,
        prerender: settings.prerender,
        pending: setNavigating,
        async show(page, fresh) {
          const view = await load(page.component)
          flushSync(() => set((now) => ({ page, view, mounts: now.mounts + Number(fresh) })))
        },
      })
    }
    if (root.hasChildNodes()) hydrateRoot(root, app)
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

/** true while a navigation or a form's submission is on its way */
export function useNavigating(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigating,
    () => false,
  )
}

/**
 * To a page of the app, as a link would (`history: 'replace'`: in place of this one). Every navigation is the client's,
 * `location.href = …` too: `document: true` loads the URL as a document (what changes `<html>`, a language).
 */
export function navigate(
  href: string,
  options: { history?: 'auto' | 'push' | 'replace'; document?: boolean } = {},
) {
  go(href, options.history, options.document)
}

/** this page's props asked for again: the page keeps its state and the scroll position */
export function reload() {
  again()
}
