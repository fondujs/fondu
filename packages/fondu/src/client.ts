import type { TypedResponse } from 'hono'
import type { StatusCode } from 'hono/utils/http-status'

import { fillPattern } from './paths.js'
import type { answerOf, schemasOf } from './server/handler.js'
import type { Routes } from './types.js'

type Keys = keyof Routes & string
type Actions = {
  [P in Keys]: Routes[P] extends { actions: infer A } ? `${P}?${keyof A & string}` : never
}[Keys]
export type Href = [Keys] extends [never] ? string : Keys | Actions

/** the params of a URL pattern, without its action (`?name`): `/users/:id/files/:path{.+}` → id, path */
type ParamNames<P extends string> = P extends `${infer Path}?${string}`
  ? PathParams<Path>
  : PathParams<P>
type PathParams<P extends string> = P extends `${string}:${infer Rest}`
  ? Rest extends `${infer Segment}/${infer More}`
    ? ParamName<Segment> | PathParams<More>
    : ParamName<Rest>
  : never
/** a param's name, without its pattern (a catch-all's `{.+}`) */
type ParamName<S extends string> = S extends `${infer Name}{${string}` ? Name : S

/** the handlers answering a GET of the URL (its page's `loader`, a `.ts` file's `GET`), or the action's */
type HandlersOf<P extends string> = P extends `${infer K}?${infer A}`
  ? K extends Keys
    ? Routes[K] extends { actions: infer As }
      ? As[A & keyof As]
      : never
    : never
  : P extends Keys
    ? Routes[P] extends { loader: infer L }
      ? L
      : Routes[P] extends { GET: infer G }
        ? G
        : never
    : never
/** a query value: what its schema takes (`unknown`, as a coercing schema's input: any) */
type QueryValue = string | number | boolean | null | undefined
/** the query a handler's schema takes (a `withValidator` handler; any query otherwise) */
type QueryOfHandler<H> = [H] extends [{ readonly [schemasOf]?: infer S }]
  ? S extends { query: { '~standard': { types?: infer T } } }
    ? NonNullable<T> extends { input: infer I extends object }
      ? { [K in keyof I]: unknown extends I[K] ? QueryValue : I[K] }
      : Record<string, QueryValue>
    : Record<string, QueryValue>
  : Record<string, QueryValue>
type QueryOf<P extends string> = QueryOfHandler<HandlersOf<P>>
/** `query`, required when its schema requires a field */
type QueryArg<Q> = {} extends Q ? { query?: Q } : { query: Q }
/** `query` is required when its schema requires a field */
type Extra<P extends string> = { hash?: string } & QueryArg<QueryOf<P>>
/** the params of a URL pattern, as the options take them */
type ParamArgs<P extends string> = { [K in ParamNames<P>]: string | number }
type Args<P extends string> = [ParamNames<P>] extends [never]
  ? {} extends QueryOf<P>
    ? [options?: Extra<P>]
    : [options: Extra<P>]
  : [params: ParamArgs<P> & Extra<P>]

/**
 * Typed URLs from `app/routes/` (as React Router's `href`): `href('/users/:id', { id })` → `'/users/7'`;
 * one of a file's `actions`: `href('/users/:id?delete', { id })`. Only patterns that exist; params are required.
 * A form's action too: `<form method="post" action={href('/logout')}>`. With `query` (typed by the route's
 * `withValidator({ query })`, if it has one) and `hash`: `href('/search', { query: { q }, hash: 'results' })`.
 */
export function href<P extends Href>(path: P, ...[options]: Args<P>): string {
  const { query, hash, ...params } = (options ?? {}) as {
    query?: Record<string, unknown>
    hash?: string
    [param: string]: unknown
  }
  return buildUrl(path, params, query, hash)
}

function buildUrl(
  path: string,
  params: Record<string, unknown>,
  query: Record<string, unknown> | undefined,
  hash: string | undefined,
): string {
  let url = fillPattern(path, params as Record<string, string | number>)
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(query ?? {}))
    for (const v of [value].flat())
      if (v !== undefined && v !== null) search.append(name, String(v))
  const qs = search.toString()
  if (qs) url += (url.includes('?') ? '&' : '?') + qs
  if (hash) url += `#${encodeURI(hash)}`
  return url
}

export {
  usePage,
  useNavigation,
  reload,
  Deferred,
  __entry,
  renderPage,
  type Errors,
  type Navigation,
} from './client/app.js'
export { useForm } from './client/form.js'
export { loadDocument, navigate, type Page } from './client/navigation.js'
export type { ProgressOptions } from './client/progress.js'

// ---- fetch(): a typed call to the app's `.ts` routes (as Void's typed fetch, with Fondu's URL patterns)

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
/** no generated types (or none of routes): everything is loose, as `Href` is */
type Loose = string extends Keys ? true : [Keys] extends [never] ? true : false
/** the HTTP methods a route file exports (a page has none) */
type MethodsOf<P extends string> = Loose extends true
  ? HttpMethod
  : P extends Keys
    ? keyof Routes[P] & HttpMethod
    : never
/**
 * The URL patterns of route files that export an HTTP method (`.ts` files). A page's pattern is not one: a page's
 * data is its props (its loader, `defer()`), and `fetch()` is for effects and events.
 */
export type ApiPath = Loose extends true
  ? string
  : { [P in Keys]: [MethodsOf<P>] extends [never] ? never : P }[Keys]
/** the handler of the route's method */
type HandlerOf<P extends string, M extends string> = Loose extends true
  ? unknown
  : P extends Keys
    ? Routes[P] extends { [K in M]: infer H }
      ? H
      : never
    : never

/** what the handler's `withValidator` body schema takes (any JSON when it has none) */
type BodyOfHandler<H> = [H] extends [{ readonly [schemasOf]?: infer S }]
  ? S extends { body: { '~standard': { types?: infer T } } }
    ? NonNullable<T> extends { input: infer I }
      ? I
      : unknown
    : unknown
  : unknown
type BodyArg<M extends string, B> = M extends 'GET'
  ? { body?: never }
  : {} extends B
    ? { body?: B }
    : undefined extends B
      ? { body?: B }
      : { body: B }
/** `method`: omitted is GET, so required when the route has no GET */
type MethodArg<P extends string, M extends string> =
  'GET' extends MethodsOf<P> ? { method?: M } : { method: M }

type FetchOptions<P extends string, M extends HttpMethod> = ParamArgs<P> &
  MethodArg<P, M> &
  QueryArg<QueryOfHandler<HandlerOf<P, M>>> &
  BodyArg<M, BodyOfHandler<HandlerOf<P, M>>> & { headers?: HeadersInit; signal?: AbortSignal }
/** the options are optional when nothing is required: no params, no `body`, `query` or `method` to give */
export type FetchArgs<P extends string, M extends HttpMethod> =
  {} extends FetchOptions<P, M> ? [options?: FetchOptions<P, M>] : [options: FetchOptions<P, M>]

/** what a handler returns, in the type: a `defineHandler(...)` tuple, a `withValidator` handler, a function */
type ReturnedBy<H> = typeof answerOf extends keyof H
  ? NonNullable<H[typeof answerOf & keyof H]>
  : H extends readonly [...unknown[], infer Last]
    ? Returned<Last>
    : Returned<H>
type Returned<F> = F extends (...args: never[]) => infer R ? Exclude<Awaited<R>, void> : unknown
/**
 * The answer as JSON delivers it: Hono's `c.json(data)` is a `TypedResponse` whose data is already what JSON makes of
 * it (a `Date` is a string, `undefined` fields are dropped). Any other answer (text, a redirect, a body, or a
 * branch that is not `c.json`) is `unknown`.
 */
type AnswerOfResponse<R> = [R] extends [never]
  ? unknown
  : [R] extends [TypedResponse<unknown, StatusCode, 'json'>]
    ? R extends TypedResponse<infer T, StatusCode, 'json'>
      ? T
      : never
    : unknown
export type AnswerOf<P extends string, M extends string> = Loose extends true
  ? unknown
  : AnswerOfResponse<ReturnedBy<HandlerOf<P, M>>>

/** a non-2xx answer: `status`, `data` (the parsed body: a 422's `{ errors }`) and the `response` */
export class FetchError extends Error {
  readonly status: number
  readonly data: unknown
  readonly response: Response
  constructor(method: string, url: string, response: Response, data: unknown) {
    super(`${method} ${url}: ${response.status}`)
    this.name = 'FetchError'
    this.status = response.status
    this.data = data
    this.response = response
  }
}

/**
 * Calls a `.ts` route of the app from the browser (an effect, an event), typed by the route file: the params as
 * `href()` takes them, `query` and `body` by the handler's `withValidator` schemas, `method` one the file exports
 * (GET when left out), the answer by what the handler returns with `c.json()`, as JSON delivers it.
 *
 *     const usage = await fetch('/api/usage')
 *     await fetch('/api/settings', { method: 'POST', body: { emails: false } })
 *
 * A non-2xx answer throws a `FetchError`. No retry, no cache. A page's data comes from its loader or `defer()`:
 * called during the server render, it throws. (Follows Void's typed fetch.)
 */
export async function fetch<
  P extends ApiPath,
  M extends MethodsOf<P> & HttpMethod = Extract<MethodsOf<P>, 'GET'>,
>(path: P, ...[options]: FetchArgs<P, M>): Promise<AnswerOf<P, M>> {
  if (typeof document === 'undefined')
    throw new Error(
      "fondu: fetch() from fondu/client is for the browser (effects, events); a page's data comes from its loader or defer()",
    )
  const {
    method = 'GET',
    query,
    body,
    headers,
    signal,
    ...params
  } = (options ?? {}) as {
    method?: string
    query?: Record<string, unknown>
    body?: unknown
    headers?: HeadersInit
    signal?: AbortSignal
    [param: string]: unknown
  }
  const url = buildUrl(path, params, query, undefined)
  // a Headers object: the call's headers replace ours whatever their case
  const all = new Headers({ Accept: 'application/json' })
  if (body !== undefined) all.set('Content-Type', 'application/json')
  new Headers(headers).forEach((value, name) => all.set(name, value))
  const response = await globalThis.fetch(url, {
    method,
    headers: all,
    body: JSON.stringify(body),
    signal,
  })
  const data = await readAnswer(response)
  if (!response.ok) throw new FetchError(method, url, response, data)
  return data as AnswerOf<P, M>
}

/** the answer's body: JSON when its content type says so, else text; none for 204 or an empty body */
async function readAnswer(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  if (!/[/+]json\b/i.test(response.headers.get('content-type') ?? '')) return text
  try {
    return JSON.parse(text)
  } catch (error) {
    // an error page that says it is JSON and isn't: its text is the data
    if (!response.ok) return text
    throw error
  }
}
