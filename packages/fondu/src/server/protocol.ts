import type { Page, SharedPageProps } from '@inertiajs/core'
/// <reference path="../virtual.d.ts" />
import type { Context, MiddlewareHandler } from 'hono'
import { pages, version } from 'virtual:fondu/assets'

import { isPageFile } from '../paths.js'
import type { Pages } from '../types.js'
import { renderDocument } from './document.js'
import { flashCookie, takeCarried } from './flash.js'
import { isInertia, sameOrigin } from './http.js'
import { kindOf, propSpec, resolve, type Paginated } from './props.js'

/**
 * The server side of Inertia's protocol (https://inertiajs.com/docs/v3/core-concepts/the-protocol).
 * The client is `@inertiajs/react`, unchanged.
 */

// ---- shared data (`share`): props every page gets, typed by Inertia's own `InertiaConfig['sharedPageProps']`

type Shareable<T> = { [K in keyof T]?: T[K] | (() => T[K] | Promise<T[K]>) }
const shared = new WeakMap<Context, Record<string, unknown>>()

/** Props every page of this request gets (a middleware calls it: the signed-in user…). */
export function share(c: Context, props: Shareable<SharedPageProps> & Record<string, unknown>) {
  shared.set(c, { ...shared.get(c), ...props })
}

// ---- render

type PageName = [keyof Pages] extends [never] ? string : Extract<keyof Pages, string>
type ComponentProps<N> = N extends keyof Pages
  ? Pages[N] extends { default: (...args: infer A) => unknown }
    ? A extends [infer P, ...unknown[]]
      ? P
      : Record<string, never>
    : Record<string, unknown>
  : Record<string, unknown>
/** shared props the page takes with the same type: `render` may leave them out (every page gets them) */
type FromShared<P> = { [K in keyof P & keyof SharedPageProps]: SharedPageProps[K] extends P[K] ? K : never }[keyof P &
  keyof SharedPageProps]
/** a page prop named like a shared prop, of another type: it would hide the shared one from the layout */
type Clashing<P> = string extends keyof SharedPageProps
  ? never
  : Exclude<keyof P & keyof SharedPageProps, FromShared<P>>
type ClashError = 'fondu: this page prop has the name of a shared prop (share()); rename it'
/** what `render` takes: the component's props, less `errors` and the shared props it gets anyway (may still be given) */
type OwnProps<N> = Omit<ComponentProps<N>, FromShared<ComponentProps<N>> | Clashing<ComponentProps<N>> | 'errors'> &
  Partial<Pick<ComponentProps<N>, FromShared<ComponentProps<N>>>> & { [K in Clashing<ComponentProps<N>>]: ClashError }
type PropsInput<P> = { [K in keyof P]: P[K] | (() => P[K] | Promise<P[K]>) }
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T]

export interface RenderOptions {
  status?: number
  encryptHistory?: boolean
  clearHistory?: boolean
  preserveFragment?: boolean
}
type RenderArgs<N> = [RequiredKeys<OwnProps<N>>] extends [never]
  ? OptionalArgs<N>
  : string extends keyof OwnProps<N>
    ? OptionalArgs<N>
    : RequiredArgs<N>
type OptionalArgs<N> = [props?: PropsInput<OwnProps<N>>, options?: RenderOptions]
type RequiredArgs<N> = [props: PropsInput<OwnProps<N>>, options?: RenderOptions]

// development: the files in app/pages/ (Vite keeps the list current); a build: the pages in the client manifest
const devPages = import.meta.env.DEV ? import.meta.glob('/app/pages/**/*.{tsx,jsx,mdx}') : {}
export const hasPage = (name: string) =>
  pages
    ? pages.includes(name)
    : isPageFile(`${name}.tsx`) && ['tsx', 'jsx', 'mdx'].some((ext) => `/app/pages/${name}.${ext}` in devPages)

const headerSet = (c: Context, name: string) => {
  const value = c.req.header(name)
  return value === undefined
    ? null
    : new Set(
        value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
}
const isPrefetch = (c: Context) =>
  c.req.header('purpose') === 'prefetch' || c.req.header('sec-purpose')?.includes('prefetch') === true

/** This URL as the page's: the request's for a GET, the page the request came from otherwise. */
function pageUrl(c: Context): string {
  const here = new URL(c.req.url)
  const from = c.req.method === 'GET' ? here : (sameOrigin(c, c.req.header('referer')) ?? here)
  return from.pathname.replace(/^\/+/, '/') + from.search
}

/**
 * The page `component` (a file in `pages/`, without extension) with these props: JSON for Inertia's requests,
 * the HTML document (server-rendered) otherwise. Props are checked against the component's own props.
 */
export async function render<N extends PageName>(
  c: Context,
  component: N,
  ...[props = {} as PropsInput<OwnProps<N>>, options = {}]: RenderArgs<N>
): Promise<Response> {
  if (!hasPage(component))
    throw new Error(`fondu: there is no page "${component}": create app/pages/${component}.tsx (or .mdx)`)
  const partial = c.req.header('x-inertia-partial-component') === component
  const only = partial ? headerSet(c, 'x-inertia-partial-data') : null
  const except = partial ? headerSet(c, 'x-inertia-partial-except') : null
  const reset = headerSet(c, 'x-inertia-reset') ?? new Set<string>()
  const heldOnce = headerSet(c, 'x-inertia-except-once-props') ?? new Set<string>()
  const carried = takeCarried(c, !partial && !isPrefetch(c))
  const sharedProps = shared.get(c) ?? {}
  const all: Record<string, unknown> = { ...sharedProps, ...(props as Record<string, unknown>) }

  const page: Page & Record<string, unknown> = {
    component,
    props: { errors: {} },
    url: pageUrl(c),
    version: version ?? null,
    flash: carried.flash,
  } as unknown as Page & Record<string, unknown>
  const lists = {
    mergeProps: [] as string[],
    prependProps: [] as string[],
    deepMergeProps: [] as string[],
    matchPropsOn: [] as string[],
  }
  const deferred: Record<string, string[]> = {}
  const onceProps: Record<string, { prop: string; expiresAt: number | null }> = {}
  const pending: Array<[string, unknown]> = []

  for (const [key, value] of Object.entries(all)) {
    const spec = propSpec(value)
    const kind = spec && kindOf(spec)
    const asked = only ? only.has(key) : true
    const sent = kind === 'always' || (asked && !except?.has(key))
    if (kind === 'defer' && !partial) {
      ;(deferred[(spec as { group: string }).group] ??= []).push(key)
      continue
    }
    if (kind === 'optional' && !only?.has(key)) continue
    if (kind === 'once') {
      const once = spec as { key?: string; ttl?: number; fresh?: boolean }
      const name = once.key ?? key
      onceProps[name] = { prop: key, expiresAt: once.ttl ? Date.now() + once.ttl * 1000 : null }
      if (heldOnce.has(name) && !only?.has(key) && !once.fresh) continue
    }
    if (!sent) continue
    if (kind === 'merge' && !reset.has(key)) {
      const m = spec as { strategy: 'append' | 'prepend' | 'deep'; matchOn: string[] }
      lists[m.strategy === 'append' ? 'mergeProps' : m.strategy === 'prepend' ? 'prependProps' : 'deepMergeProps'].push(
        key,
      )
      lists.matchPropsOn.push(...m.matchOn.map((field) => `${key}.${field}`))
    }
    if (kind === 'scroll' && !reset.has(key)) {
      // <InfiniteScroll> says which side it loads: the previous page goes before what the client holds
      lists[c.req.header('x-inertia-infinite-scroll-merge-intent') === 'prepend' ? 'prependProps' : 'mergeProps'].push(
        `${key}.data`,
      )
    }
    pending.push([key, value])
  }
  const rescued: string[] = []
  const resolved = await Promise.all(
    pending.map(async ([key, value]) => {
      const spec = propSpec(value)
      try {
        return [[key, await resolve(spec ? spec.value : value)] as const]
      } catch (error) {
        if (!(spec && kindOf(spec) === 'defer' && (spec as { rescue: boolean }).rescue)) throw error
        console.error(`[fondu] deferred prop "${key}" failed (rescued):`, error)
        rescued.push(key)
        return []
      }
    }),
  )
  page.props = { ...Object.fromEntries(resolved.flat()), errors: carried.errors } as Page['props']
  if (rescued.length) page.rescuedProps = rescued

  const scrollProps: NonNullable<Page['scrollProps']> = {}
  for (const [key, value] of pending) {
    const spec = propSpec(value)
    if (spec && kindOf(spec) === 'scroll' && key in page.props) {
      const { currentPage, previousPage, nextPage } = page.props[key] as Paginated<unknown>
      scrollProps[key] = {
        pageName: (spec as { pageName: string }).pageName,
        currentPage,
        previousPage,
        nextPage,
        reset: reset.has(key),
      }
    }
  }
  if (Object.keys(scrollProps).length) page.scrollProps = scrollProps

  for (const [name, list] of Object.entries(lists)) if (list.length) page[name] = list
  if (Object.keys(deferred).length) page.deferredProps = deferred
  if (Object.keys(onceProps).length) page.onceProps = onceProps
  const sharedKeys = Object.keys(sharedProps)
  if (sharedKeys.length) page.sharedProps = sharedKeys
  if (options.encryptHistory) page.encryptHistory = true
  if (options.clearHistory || carried.clearHistory) page.clearHistory = true
  if (options.preserveFragment) page.preserveFragment = true

  c.header('Vary', 'X-Inertia', { append: true })
  // a page is this visitor's: not stored by shared caches, revalidated by the browser (unless the route said otherwise)
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'private, no-cache')
  if (isInertia(c)) {
    c.header('X-Inertia', 'true')
    return c.json(page, (options.status ?? 200) as 200)
  }
  return c.html(await renderDocument(c, page), (options.status ?? 200) as 200)
}

// ---- the protocol middleware (installed by createApp)

const versionCheck: MiddlewareHandler = async (c, next) => {
  // an Inertia visit made by a client built from other assets: reload the page as a document
  if (version && c.req.method === 'GET' && isInertia(c) && c.req.header('x-inertia-version') !== version) {
    return c.body(null, 409, { 'X-Inertia-Location': c.req.url, 'X-Inertia-Version': version })
  }
  await next()
  if (!isInertia(c) || c.res.status < 300 || c.res.status > 399) return
  const to = c.res.headers.get('location') ?? ''
  if (to.includes('#')) {
    // the browser's fetch would follow the redirect and drop the #fragment: the client visits it itself
    const headers = new Headers(c.res.headers)
    headers.delete('location')
    headers.set('X-Inertia-Redirect', to)
    c.res = new Response(null, { status: 409, headers })
  } else if (c.res.status === 302 && ['PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    // a 302 after PUT / PATCH / DELETE would be followed with the same method: make it 303 (Inertia's rule)
    c.res = new Response(c.res.body, { status: 303, headers: c.res.headers })
  }
}

export const protocol: MiddlewareHandler[] = [flashCookie, versionCheck]
