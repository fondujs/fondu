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

type Shareable<T> = { [K in keyof T]?: T[K] | (() => T[K] | Promise<T[K]>) }
const shared = new WeakMap<Context, Record<string, unknown>>()

/** Props every page of this request gets (a middleware calls it: the signed-in user…); a function when one renders */
export function share(c: Context, props: Shareable<Shared>) {
  shared.set(c, { ...shared.get(c), ...props })
}

type PageComponent<P> =
  | ((props: P) => ReactNode | Promise<ReactNode>)
  | (new (props: P) => Component<P>)
type Named<P> = keyof P &
  keyof {
    [K in keyof P as {} extends Record<K, unknown> ? never : K]: 0
  }
type SharedKey = Exclude<Named<Shared>, 'errors'>
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

type Json = string | number | boolean | null
/** JSON.stringify leaves these out of an object, and writes null for them in an array */
type Omitted = undefined | symbol | ((...args: never[]) => unknown)
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
type Arrives<T> = true extends Holds<T, NotJson> ? false : true
// What a route may pass for a page prop of type T: a value of type T, or one whose toJSON() gives that. Nested, JSON drops
// what a slot may not hold (an optional property takes undefined, a function or a symbol).
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
// left out when undefined (or a function, or a symbol): optional if it may be anything else; an index signature has no optional keys
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
type Carrier<T> = true extends Holds<Wire<T>, BigIntError> ? BigIntError['error'] : unknown
export type AsJson<T extends Carrier<T>> = Wire<T>

type NotJsonError =
  'fondu: the page receives this prop as JSON (a Date as a string, a Map as {}): type it as such'
type PropInput<T> = Arrives<T> extends true ? JsonInput<T> : NotJsonError
export type Delivered<P> = {
  [K in keyof P]: PropInput<P[K]>
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
type OverrideInput<A, B> = [Live<Both<A, B>, A | B>] extends [never]
  ? ClashError
  : PropInput<Both<A, B>>
/** Mark the override optional *after* checking its explicit JSON value (omitting it keeps the shared value). */
type Overrides<P, Required extends keyof P & SharedKey> = {
  [K in Required]: OverrideInput<P[K], Shared[K]>
} & {
  [K in Exclude<keyof P & SharedKey, Required>]?: OverrideInput<P[K], Shared[K]>
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

// the ids: a page may be the default export of several (`export { default } from './index.tsx'`)
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

function pageUrl(c: Context): string {
  const here = new URL(c.req.url)
  const from = c.req.method === 'GET' ? here : (referer(c) ?? here)
  return pathAndQuery(from)
}

/** The route file's page with these props: JSON for a navigation, the server-rendered HTML document otherwise. */
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

/** @internal The page `id` (a route file without its extension) with these props: `render()`, the error page */
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
        `fondu: the prop "${key}" of "${id}" is a promise, which JSON would send as {}. Await it`,
      )
  const carried = takeCarried(c)
  const fromShared = await Promise.all(
    Object.entries(shared.get(c) ?? {}).map(async ([key, value]) => [
      key,
      typeof value === 'function' ? await value() : value,
    ]),
  )
  const page: PageObject = {
    component: id,
    props: { ...Object.fromEntries(fromShared), ...props, errors: carried.errors },
    url: pageUrl(c),
    version,
    flash: carried.flash,
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

function protocolOf(c: Context, to: string): string | null {
  try {
    return new URL(to, c.req.url).protocol
  } catch {
    return null
  }
}

const webUrl = (c: Context, to: string) => /^https?:$/.test(protocolOf(c, to) ?? '')

const SCRIPT_SCHEMES = ['javascript:', 'data:', 'vbscript:']

function scriptScheme(c: Context, to: string): string | null {
  const protocol = protocolOf(c, to)
  return protocol && SCRIPT_SCHEMES.includes(protocol) ? protocol : null
}

// every header that selects what a navigation answers
const NAVIGATION_VARY = 'X-Fondu, X-Fondu-Version'

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
  const location = c.res.headers.get('location')
  if (location && c.res.status >= 300 && c.res.status < 400) {
    const scheme = scriptScheme(c, location)
    if (scheme) {
      // Hono keeps the headers of the response an error replaces: without its own, no `Location` stays
      c.res = new Response(null, { status: 500 })
      c.res.headers.delete('location')
      throw new Error(`fondu: a redirect to "${scheme}" is refused`)
    }
  }
  // a URL answers a navigation and a document differently: caches keep them apart
  appendHeader(c, 'Vary', isPageRequest(c) ? NAVIGATION_VARY : 'X-Fondu')
  // an empty answer to a form (`c.body(null)`): back to the page. Its body isn't read to tell (a stream's would be, to its
  // end)
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
