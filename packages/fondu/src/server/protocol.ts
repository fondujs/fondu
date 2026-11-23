/// <reference path="../virtual.d.ts" />
import type { Context, MiddlewareHandler } from 'hono'
import type { Component, ReactNode } from 'react'
import { version } from 'virtual:fondu/assets'

import type { PageObject } from '../client/navigation.js'
import type { Shared } from '../types.js'
import { renderDocument } from './document.js'
import { flashCookie, takeCarried } from './flash.js'
import {
  appendHeader,
  back,
  isPageRequest,
  isPrerendering,
  pathAndQuery,
  referer,
  sameOrigin,
} from './http.js'

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

// ---- deferred props (`defer`): left out of a page, asked for by a request of their own
// As Inertia's deferred props, with rescue always on (a function that throws is logged and its prop left out); no groups

/** a prop the page gets with a second request: `defer(fn)` in `render()`'s props */
class DeferredProp<T> {
  declare readonly type?: T // phantom: what `fn` gives (no toJSON: a deferred prop is no JSON input)
  readonly load: () => T | PromiseLike<T>
  constructor(load: () => T | PromiseLike<T>) {
    this.load = load
  }
}
Object.defineProperty(DeferredProp.prototype, 'toJSON', {
  value() {
    throw new Error(
      'fondu: defer() is for a prop of render(), at the top (not in share(), not inside a prop)',
    )
  },
})
export type { DeferredProp }

/**
 * A prop of the page that is not sent with it: `render(c, Page, { user, stats: defer(() => loadStats()) })`. The page
 * renders without it (optional in the component's props); the client asks for it once the page is on the screen, and
 * `fn` runs only for that request.
 */
export function defer<T>(fn: () => T | PromiseLike<T>): DeferredProp<T> {
  return new DeferredProp(fn)
}

// ---- render

/** a page: a component, its props what it receives (a function component, or a class one) */
type PageComponent<P> =
  | ((props: P) => ReactNode | Promise<ReactNode>)
  | (new (props: P) => Component<P>)
/** the props a page names: not an index signature (a page without props takes `Record<string, never>`) */
type Named<P> = keyof P &
  keyof {
    [K in keyof P as {} extends Record<K, unknown> ? never : K]: 0
  }
type SharedKey = Exclude<Named<Shared>, 'errors'>
/** Shared keys named by at least one page variant (not just the keys common to every variant). */
type UsedShared<P> = P extends unknown ? Named<P> & SharedKey : never
/** An index constrains a field's value, not its presence. */
type Field<P, K extends keyof P> = K extends Named<P> ? Pick<P, K> : Partial<Pick<P, K>>
type NeedsOverride<P, Keys extends keyof P & SharedKey> = {
  [K in Keys]: Pick<Shared, K> extends Field<P, K> ? never : K
}[Keys]
/** The explicit value must fit both readers, even if one is an untyped dictionary. */
type Both<A, B> = unknown extends A ? B : unknown extends B ? A : A & B

type OwnProps<P> = {
  [K in keyof P as K extends 'errors' | SharedKey ? never : K]: P[K]
}

// ---- props as JSON delivers them: a page's prop types are what it receives; `render` takes what becomes that

type Json = string | number | boolean | null
/** JSON.stringify leaves these out of an object, and writes null for them in an array */
type Omitted = undefined | symbol | ((...args: never[]) => unknown)
/** objects with no own data: JSON writes {} */
type Hollow =
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | RegExp
/** types JSON doesn't deliver as they are: a Date arrives as a string, a Map or a Set as {}, a function not at all */
type NotJson = Date | Hollow | bigint | Exclude<Omitted, undefined>
/** (not `0 extends 1 & T`: a constraint written with T on the right is a circular one, as AsJson's is) */
type IsAny<T> = unknown extends T ? ([T] extends [string] ? true : false) : false
/** does a member of T, at any depth (limited, for recursive types), extend Needle? */
type Holds<T, Needle, D extends unknown[] = []> =
  IsAny<T> extends true
    ? false
    : T extends Needle
      ? true
      : D['length'] extends 6
        ? false
        : T extends readonly (infer E)[]
          ? Holds<E, Needle, [...D, 0]>
          : T extends object
            ? Holds<T[keyof T], Needle, [...D, 0]>
            : false
/** T arrives as itself: nothing in it is a type JSON doesn't deliver as it is */
type Arrives<T> = true extends Holds<T, NotJson> ? false : true
/**
 * What a route may pass for a page prop of type T: a value of type T (its parts through JsonInput too), or one whose
 * toJSON() gives that (a Date for a string). Nested, JSON drops what a slot may not hold: an optional property takes
 * undefined, a function or a symbol; a null in an array takes them too (they are written as null).
 */
type JsonInput<T> = IsAny<T> extends true ? T : Plain<T> | { toJSON(): Plain<T> }
/** T without its own toJSON() step (JSON.stringify calls it once: its result's own is not called) */
type Plain<T> = T extends Json | undefined
  ? T
  : T extends readonly unknown[]
    ? {
        readonly [K in keyof T]: JsonInput<T[K]> | (null extends T[K] ? Omitted : never)
      } & NoToJson
    : T extends object
      ? { [K in keyof T]: JsonInput<T[K]> | (undefined extends T[K] ? Omitted : never) } & NoToJson
      : T
/** a value shaped as T that has a toJSON() is written as that gives, not as T: it goes by the other branch */
type NoToJson = { toJSON?: never }
/** where a bigint was: JSON.stringify throws on one (an object, so that a string in a union doesn't absorb it) */
type BigIntError = {
  error: 'fondu: JSON cannot carry a bigint (JSON.stringify throws): convert it first'
}
/** T as JSON.stringify writes it, what a page receives (the other side of JsonInput); undefined: left out */
type Wire<T> = IsAny<T> extends true ? T : T extends { toJSON(): infer R } ? Written<R> : Written<T>
type Written<T> = unknown extends T
  ? T
  : T extends bigint
    ? BigIntError
    : T extends Json
      ? T
      : T extends Omitted
        ? undefined
        : T extends Hollow
          ? {}
          : T extends readonly unknown[]
            ? { [K in keyof T]: NullForUndefined<Wire<T[K]>> }
            : T extends object
              ? WrittenObject<T>
              : T
type NullForUndefined<W> = W extends undefined ? null : W
/**
 * A property is left out when its value is undefined (or a function, or a symbol): optional if it may be anything
 * else, none if it is only that. An index signature has no optional keys: its values are the rest.
 */
type WrittenObject<T> = Flat<
  {
    [
      K in keyof T as K extends symbol
        ? never
        : [Exclude<Wire<T[K]>, undefined>] extends [never]
          ? never
          : {} extends Record<K, unknown>
            ? K
            : undefined extends Wire<T[K]>
              ? never
              : K
    ]: Exclude<Wire<T[K]>, undefined>
  } & {
    [
      K in keyof T as K extends symbol
        ? never
        : [Exclude<Wire<T[K]>, undefined>] extends [never]
          ? never
          : {} extends Record<K, unknown>
            ? never
            : undefined extends Wire<T[K]>
              ? K
              : never
    ]?: Exclude<Wire<T[K]>, undefined>
  }
>
type Flat<T> = { [K in keyof T]: T[K] }
/** a bigint anywhere in T: JSON.stringify throws on it, so AsJson<T> is an error */
type Carrier<T> = true extends Holds<Wire<T>, BigIntError> ? BigIntError['error'] : unknown
export type AsJson<T extends Carrier<T>> = Wire<T>

type NotJsonError =
  'fondu: the page receives this prop as JSON (a Date as a string, a Map as {}): type it as such'
/** Only defer a value when the page can render without the override. */
type PropInput<T, Optional extends boolean = false> =
  Arrives<T> extends true
    ?
        | JsonInput<T>
        | (Optional extends true ? DeferredProp<JsonInput<Exclude<T, undefined>>> : never)
    : NotJsonError
export type Delivered<P> = {
  [K in keyof P]: PropInput<P[K], {} extends Pick<P, K> ? true : false>
}

export interface RenderOptions {
  status?: number
}
type ClashError = 'fondu: this page prop has the name of a shared prop (share()); rename it'
type Live<T, From> = T extends unknown
  ? [T] extends [never]
    ? never
    : T extends Primitive
      ? [
          Exclude<
            keyof T,
            keyof string | keyof number | keyof boolean | keyof bigint | keyof symbol
          >,
        ] extends [never]
        ? T
        : [Extract<From, T>] extends [never]
          ? never
          : T
      : T
  : never
type Primitive = string | number | boolean | bigint | symbol
type OverrideInput<A, B, Optional extends boolean = false> = [Live<Both<A, B>, A | B>] extends [
  never,
]
  ? ClashError
  : PropInput<Both<A, B>, Optional>
/** Mark the override optional *after* checking its explicit JSON value (omitting it keeps the shared value). */
type Overrides<P, Required extends keyof P & SharedKey> = {
  [K in Required]: OverrideInput<P[K], Shared[K]>
} & {
  [K in Exclude<keyof P & SharedKey, Required>]?: OverrideInput<P[K], Shared[K], true>
}
type RenderBranch<P, Keys extends keyof P & SharedKey> =
  Exclude<keyof P, 'errors'> extends never
    ? Record<string, never>
    : Delivered<OwnProps<P>> & Overrides<P, NeedsOverride<P, Keys>>
/** Middleware can introduce any of these keys: their absence cannot distinguish the delivered branch. */
type RenderProps<P, Keys extends SharedKey = UsedShared<P>> = P extends unknown
  ? [Keys] extends [keyof P]
    ? RenderBranch<P, Keys>
    : never
  : never
type RenderArgs<P> =
  {} extends RenderProps<P>
    ? [props?: RenderProps<P>, options?: RenderOptions]
    : [props: RenderProps<P>, options?: RenderOptions]

// the pages of app/routes/ (createApp): a component → its ids; and, per request, the page of the route answering it
// (the ids: a page may be the default export of several, `export { default } from './index.tsx'`)
const pageIds = new WeakMap<object, Set<string>>()
const ownPages = new WeakMap<Context, string>()
export const registerPage = (component: object, id: string) => {
  const ids = pageIds.get(component) ?? new Set()
  pageIds.set(component, ids.add(id))
}
export const routePage =
  (id: string): MiddlewareHandler =>
  async (c, next) => {
    ownPages.set(c, id)
    await next()
  }

/** This URL as the page's: the request's for a GET, the page the request came from otherwise. */
function pageUrl(c: Context): string {
  const here = new URL(c.req.url)
  const from = c.req.method === 'GET' ? here : (referer(c) ?? here)
  return pathAndQuery(from)
}

/**
 * The route file's page (its default export) with these props: JSON for a navigation, the HTML document
 * (server-rendered) otherwise. Props are checked against the component's own, as JSON delivers them.
 */
export function render<P extends object>(
  c: Context,
  page: PageComponent<P>,
  ...[props = {} as RenderProps<P>, options = {}]: RenderArgs<P>
): Promise<Response> {
  const own = ownPages.get(c)
  if (!own || !pageIds.get(page)?.has(own))
    throw new Error(
      own
        ? `fondu: render() renders the page of its own route file, routes/${own}: its default export`
        : 'fondu: render() renders the page of its route file (a .tsx or .mdx file, its default export); this route has none',
    )
  return renderPage(c, own, props as Record<string, unknown>, options)
}

/** @internal the page `id` (a route file without its extension) with these props: `render()`, the error page */
export async function renderPage(
  c: Context,
  id: string,
  props: Record<string, unknown>,
  options: RenderOptions = {},
): Promise<Response> {
  // a promise is serialized as `{}`: the top level only (what is inside a prop is the app's JSON)
  for (const [key, value] of Object.entries(props))
    if (typeof (value as { then?: unknown } | null | undefined)?.then === 'function')
      throw new Error(
        `fondu: the prop "${key}" of "${id}" is a promise, which JSON would send as {}. Await it, or pass defer(() => ...)`,
      )
  const only = askedFor(c, id)
  const deferred = Object.keys(props).filter((k) => props[k] instanceof DeferredProp)
  let page: PageObject
  if (only) {
    // a partial request: what was asked for, and nothing the page already has (no shared props, no errors, no flash:
    // the cookie is the next page's)
    const wanted = only.filter((k) => Object.hasOwn(props, k))
    const entries = await Promise.all(
      wanted.map(async (key) => {
        const value = props[key]
        if (!(value instanceof DeferredProp)) return [[key, value]]
        try {
          return [[key, await value.load()]]
        } catch (error) {
          console.error(`[fondu] the deferred prop "${key}" of "${id}" failed:`, error)
          return []
        }
      }),
    )
    page = {
      component: id,
      props: Object.fromEntries(entries.flat()),
      url: pageUrl(c),
      version,
      flash: {},
    }
  } else {
    const carried = takeCarried(c)
    const fromShared = await Promise.all(
      Object.entries(shared.get(c) ?? {}).map(async ([key, value]) => [
        key,
        typeof value === 'function' ? await value() : value,
      ]),
    )
    // a static page has all its data: what is deferred is awaited
    const now = isPrerendering(c)
    const own = Object.fromEntries(
      await Promise.all(
        Object.entries(props)
          .filter(([key]) => now || !deferred.includes(key))
          .map(async ([key, value]) => [
            key,
            value instanceof DeferredProp ? await value.load() : value,
          ]),
      ),
    )
    page = {
      component: id,
      props: { ...Object.fromEntries(fromShared), ...own, errors: carried.errors },
      url: pageUrl(c),
      version,
      flash: carried.flash,
      ...(deferred.length && !now && { deferred }),
    }
  }
  // a page is this visitor's: not stored by shared caches, revalidated by the browser (unless the route said otherwise)
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'private, no-cache')
  if (isPageRequest(c)) {
    c.header('X-Fondu', 'true')
    return c.json(page, (options.status ?? 200) as 200)
  }
  const status = (options.status ?? 200) as 200
  const document = await renderDocument(c, page, isPrerendering(c))
  return typeof document === 'string'
    ? c.html(document, status)
    : c.body(document, status, { 'Content-Type': 'text/html; charset=UTF-8' })
}

/**
 * The props a partial request asks for (`X-Fondu-Only: stats,feed`), if it is one: a navigation, a GET, for the
 * component this route renders
 */
function askedFor(c: Context, id: string): string[] | undefined {
  const only = c.req.header('x-fondu-only')
  if (
    !only ||
    c.req.method !== 'GET' ||
    !isPageRequest(c) ||
    c.req.header('x-fondu-component') !== id
  )
    return
  // each name once, in the order first given: a name asked twice does not run its loader twice
  return [
    ...new Set(
      only
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ]
}

/** an http(s) URL, as `to` resolves from the request's */
function webUrl(c: Context, to: string): boolean {
  try {
    return /^https?:$/.test(new URL(to, c.req.url).protocol)
  } catch {
    return false
  }
}

// ---- the protocol middleware (installed by createApp)

/**
 * Every header that selects what a navigation answers: the page object (`X-Fondu`), the 409 of an old build
 * (`X-Fondu-Version`), a partial answer (`X-Fondu-Only`, for `X-Fondu-Component`'s page)
 */
const NAVIGATION_VARY = 'X-Fondu, X-Fondu-Version, X-Fondu-Only, X-Fondu-Component'

const versionCheck: MiddlewareHandler = async (c, next) => {
  // a navigation of a client built from other assets: the page loads as a document
  if (
    version &&
    c.req.method === 'GET' &&
    isPageRequest(c) &&
    c.req.header('x-fondu-version') !== version
  ) {
    return c.body(null, 409, {
      'X-Fondu-Location': pathAndQuery(new URL(c.req.url)),
      Vary: NAVIGATION_VARY,
    })
  }
  await next()
  // a URL answers a navigation and a document differently: caches keep them apart
  appendHeader(c, 'Vary', isPageRequest(c) ? NAVIGATION_VARY : 'X-Fondu')
  // an empty answer to a form (an action that returns nothing to show, `c.body(null)`): back to the page. Its body
  // isn't read to tell (a stream's would be, to its end)
  if (isPageRequest(c) && c.res.status === 200 && !c.res.headers.has('x-fondu') && !c.res.body)
    c.res = back(c)
  const to = c.res.headers.get('location')
  if (isPageRequest(c) && c.res.status >= 300 && c.res.status < 400 && to) {
    // to another site: fetch() can't follow it (CORS), the client loads it as a document; http(s) only (a browser
    // follows no redirect to `javascript:`, and neither does the client)
    const here = sameOrigin(c, to)
    if (!here) {
      if (webUrl(c, to)) c.res = c.body(null, 409, { 'X-Fondu-Location': to })
    }
    // to a #fragment: fetch() follows it, the fragment lost (a Response's URL has none); the client follows, from
    // this site's root (a relative Location is the request's, not the page's on the screen)
    else if (to.includes('#'))
      c.res = c.body(null, 200, {
        'X-Fondu-Redirect': pathAndQuery(here) + here.hash,
      })
  }
}

export const protocol: MiddlewareHandler[] = [flashCookie, versionCheck]
