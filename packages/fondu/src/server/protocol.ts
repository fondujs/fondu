/// <reference path="../virtual.d.ts" />
import type { Context, MiddlewareHandler } from 'hono'
import type { Component, ReactNode } from 'react'
import { version } from 'virtual:fondu/assets'

import type { Page } from '../client/navigation.js'
import type { Shared } from '../types.js'
import { renderDocument } from './document.js'
import { flashCookie, takeCarried } from './flash.js'
import { back, isPageRequest, sameOrigin } from './http.js'

/**
 * Fondu's protocol: a document gets the HTML page, a navigation of fondu/client (`X-Fondu`) the page as JSON.
 */

// ---- shared data (`share`): props every page gets, typed by `Register['shared']`

type Shareable<T> = { [K in keyof T]?: T[K] | (() => T[K] | Promise<T[K]>) }
const shared = new WeakMap<Context, Record<string, unknown>>()

/** Props every page of this request gets (a middleware calls it: the signed-in user…); a function when one renders */
export function share(c: Context, props: Shareable<Shared>) {
  shared.set(c, { ...shared.get(c), ...props })
}

// ---- render

/** a page: a component, its props what it receives (a function component, or a class one) */
type PageComponent<P> =
  | ((props: P) => ReactNode | Promise<ReactNode>)
  | (new (props: P) => Component<P>)
/** the props a page names: not an index signature (a page without props takes `Record<string, never>`) */
type Named<P> = keyof {
  [K in keyof P as string extends K ? never : number extends K ? never : K]: 0
}
/** shared props the page takes with the same type: `render` may leave them out (every page gets them) */
type FromShared<P> = {
  [K in Named<P> & keyof Shared]: Shared[K] extends P[K] ? K : never
}[Named<P> & keyof Shared]
/** a page prop named like a shared prop, of another type: it would hide the shared one from the layout */
type Clashing<P> = string extends keyof Shared
  ? never
  : Exclude<Named<P> & keyof Shared, FromShared<P>>
type ClashError = 'fondu: this page prop has the name of a shared prop (share()); rename it'
/** what `render` takes: the component's props, less `errors` and the shared props it gets anyway (may still be given) */
type OwnProps<P> = Omit<P, FromShared<P> | Clashing<P> | 'errors'> &
  Partial<Pick<P, FromShared<P>>> & {
    [K in Clashing<P>]: ClashError
  }

// ---- props as JSON delivers them: a page's prop types are what it receives; `render` takes what becomes that

type Json = string | number | boolean | null
/** types JSON doesn't deliver as they are: a Date arrives as a string, a Map or a Set as {}, a function not at all */
type NotJson =
  | Date
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | RegExp
  | bigint
  | symbol
  | ((...args: never[]) => unknown)
type IsAny<T> = 0 extends 1 & T ? true : false
/** each member of T arrives as itself (depth-limited, for recursive types) */
type JsonMember<T, D extends unknown[]> = T extends Json | undefined
  ? true
  : T extends NotJson
    ? false
    : D['length'] extends 6
      ? true
      : T extends readonly (infer E)[]
        ? Arrives<E, [...D, 0]>
        : T extends object
          ? Arrives<T[keyof T], [...D, 0]>
          : true
type Arrives<T, D extends unknown[] = []> =
  IsAny<T> extends true
    ? true
    : unknown extends T
      ? true
      : [JsonMember<T, D>] extends [true]
        ? true
        : false
/** what a route may pass for a page prop of type T: T, or anything JSON turns into it (a Date for a string: toJSON) */
type JsonInput<T> =
  IsAny<T> extends true
    ? T
    : T extends Json | undefined
      ? T | { toJSON(): T }
      : T extends readonly (infer E)[]
        ? readonly JsonInput<E>[] | { toJSON(): T }
        : T extends object
          ? { [K in keyof T]: JsonInput<T[K]> } | { toJSON(): T }
          : T
type NotJsonError =
  'fondu: the page receives this prop as JSON (a Date as a string, a Map as {}): type it as such'
/** a page's props as `render` takes them: what becomes each as JSON, or an error for a type JSON can't deliver */
export type Delivered<P> = {
  [K in keyof P]: Arrives<P[K]> extends true ? JsonInput<P[K]> : NotJsonError
}
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T]

export interface RenderOptions {
  status?: number
}
// a page with no props of its own (none at all: P is inferred as `object`) takes none
type RenderArgs<P> = [keyof OwnProps<P>] extends [never]
  ? [props?: Record<string, never>, options?: RenderOptions]
  : [RequiredKeys<OwnProps<P>>] extends [never]
    ? OptionalArgs<P>
    : string extends keyof OwnProps<P>
      ? OptionalArgs<P>
      : RequiredArgs<P>
type OptionalArgs<P> = [props?: Delivered<OwnProps<P>>, options?: RenderOptions]
type RequiredArgs<P> = [props: Delivered<OwnProps<P>>, options?: RenderOptions]

// the pages of app/routes/ (createApp): a component → its id; and, per request, the page of the route answering it
const pageIds = new WeakMap<object, string>()
const ownPages = new WeakMap<Context, string>()
export const registerPage = (component: object, id: string) => pageIds.set(component, id)
export const routePage =
  (id: string): MiddlewareHandler =>
  async (c, next) => {
    ownPages.set(c, id)
    await next()
  }

/** This URL as the page's: the request's for a GET, the page the request came from otherwise. */
function pageUrl(c: Context): string {
  const here = new URL(c.req.url)
  const from = c.req.method === 'GET' ? here : (sameOrigin(c, c.req.header('referer')) ?? here)
  return from.pathname.replace(/^\/+/, '/') + from.search
}

/**
 * The route file's page (its default export) with these props: JSON for a navigation, the HTML document
 * (server-rendered) otherwise. Props are checked against the component's own, as JSON delivers them.
 */
export function render<P extends object>(
  c: Context,
  page: PageComponent<P>,
  ...[props = {} as Delivered<OwnProps<P>>, options = {}]: RenderArgs<P>
): Promise<Response> {
  const id = pageIds.get(page)
  const own = ownPages.get(c)
  if (!id || id !== own)
    throw new Error(
      own
        ? `fondu: render() renders the page of its own route file, routes/${own}: its default export`
        : 'fondu: render() renders the page of its route file (a .tsx or .mdx file, its default export); this route has none',
    )
  return renderPage(c, id, props as Record<string, unknown>, options)
}

/** @internal the page `id` (a route file without its extension) with these props: `render()`, the error page */
export async function renderPage(
  c: Context,
  id: string,
  props: Record<string, unknown>,
  options: RenderOptions = {},
): Promise<Response> {
  const carried = takeCarried(c)
  const fromShared = await Promise.all(
    Object.entries(shared.get(c) ?? {}).map(async ([key, value]) => [
      key,
      typeof value === 'function' ? await value() : value,
    ]),
  )
  const page: Page = {
    component: id,
    props: { ...Object.fromEntries(fromShared), ...props, errors: carried.errors },
    url: pageUrl(c),
    version: version ?? null,
    flash: carried.flash,
    ...(carried.clearHistory && { clearHistory: true }),
  }
  // a page is this visitor's: not stored by shared caches, revalidated by the browser (unless the route said otherwise)
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'private, no-cache')
  if (isPageRequest(c)) {
    c.header('X-Fondu', 'true')
    return c.json(page, (options.status ?? 200) as 200)
  }
  return c.html(await renderDocument(c, page), (options.status ?? 200) as 200)
}

// ---- the protocol middleware (installed by createApp)

const versionCheck: MiddlewareHandler = async (c, next) => {
  // a navigation of a client built from other assets: the page loads as a document
  if (
    version &&
    c.req.method === 'GET' &&
    isPageRequest(c) &&
    c.req.header('x-fondu-version') !== version
  ) {
    return c.body(null, 409, { 'X-Fondu-Location': c.req.url, Vary: 'X-Fondu' })
  }
  await next()
  // a URL answers a navigation and a document differently: caches keep them apart
  c.header('Vary', 'X-Fondu', { append: true })
  // an empty answer to a form (an action that returns nothing to show): back to the page
  if (
    isPageRequest(c) &&
    c.res.status === 200 &&
    !c.res.headers.has('x-fondu') &&
    (await c.res.clone().text()) === ''
  )
    c.res = back(c)
  // a redirect to a #fragment: fetch() follows it, the fragment lost (a Response's URL has none); the client follows
  const to = c.res.headers.get('location')
  if (isPageRequest(c) && c.res.status >= 300 && c.res.status < 400 && to?.includes('#'))
    c.res = c.body(null, 200, { 'X-Fondu-Redirect': to })
}

export const protocol: MiddlewareHandler[] = [flashCookie, versionCheck]
