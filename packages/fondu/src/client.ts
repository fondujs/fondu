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

type ParamNames<P extends string> = P extends `${infer Path}?${string}`
  ? PathParams<Path>
  : PathParams<P>
type PathParams<P extends string> = P extends `${string}:${infer Rest}`
  ? Rest extends `${infer Segment}/${infer More}`
    ? ParamName<Segment> | PathParams<More>
    : ParamName<Rest>
  : never
type ParamName<S extends string> = S extends `${infer Name}*` ? Name : S

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
type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | QueryValue[]
  | { [key: string]: QueryValue }
type QueryOfHandler<H> = [H] extends [{ readonly [schemasOf]?: infer S }]
  ? S extends { query: { '~standard': { types?: infer T } } }
    ? NonNullable<T> extends { input: infer I extends object }
      ? { [K in keyof I]: unknown extends I[K] ? QueryValue : I[K] }
      : Record<string, QueryValue>
    : Record<string, QueryValue>
  : Record<string, QueryValue>
type QueryOf<P extends string> = QueryOfHandler<HandlersOf<P>>
type QueryArg<Q> = {} extends Q ? { query?: Q } : { query: Q }
type Extra<P extends string> = { hash?: string } & QueryArg<QueryOf<P>>
type ParamArgs<P extends string> = { [K in ParamNames<P>]: string | number }
type Args<P extends string> = [ParamNames<P>] extends [never]
  ? {} extends QueryOf<P>
    ? [options?: Extra<P>]
    : [options: Extra<P>]
  : [params: ParamArgs<P> & Extra<P>]

/**
 * Typed URLs from `app/routes/`: `href('/users/:id', { id })` → `'/users/7'`. Optional `query` and `hash`; also a form's action.
 */
export function href<P extends Href>(path: P, ...[options]: Args<P>): string {
  const { query, hash, ...params } = (options ?? {}) as {
    query?: Record<string, unknown>
    hash?: string
    [param: string]: unknown
  }
  return buildUrl(path, params, query, hash)
}

// as `formObject` reads it back: a list is `name[]` (a one-item list too), an object `name[key]`
function writeQuery(search: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== undefined && v !== null)
    const flat = items.every((v) => typeof v !== 'object')
    items.forEach((v, i) => writeQuery(search, `${name}[${flat ? '' : i}]`, v))
  } else if (
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) ?? Object.prototype) === Object.prototype
  ) {
    for (const [key, v] of Object.entries(value)) writeQuery(search, `${name}[${key}]`, v)
  } else search.append(name, String(value))
}

function buildUrl(
  path: string,
  params: Record<string, unknown>,
  query: Record<string, unknown> | undefined,
  hash: string | undefined,
): string {
  let url = fillPattern(path, params as Record<string, string | number>)
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(query ?? {})) writeQuery(search, name, value)
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
  type Errors,
  type Navigation,
  type Page,
} from './client/app.js'
export { useForm } from './client/form.js'
export { closeShallow, loadDocument, navigate } from './client/navigation.js'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Loose = string extends Keys ? true : [Keys] extends [never] ? true : false
type MethodsOf<P extends string> = Loose extends true
  ? HttpMethod
  : P extends Keys
    ? keyof Routes[P] & HttpMethod
    : never
// A page's pattern is not one: its data is its props (loader, `defer()`); `request()` is for effects and events.
type ApiPath = Loose extends true
  ? string
  : { [P in Keys]: [MethodsOf<P>] extends [never] ? never : P }[Keys]
type HandlerOf<P extends string, M extends string> = Loose extends true
  ? unknown
  : P extends Keys
    ? Routes[P] extends { [K in M]: infer H }
      ? H
      : never
    : never

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
// omitted is GET, so only a call that is GET leaves it out
type MethodArg<M extends string> = [M] extends ['GET'] ? { method?: M } : { method: M }

type RequestOptions<P extends string, M extends HttpMethod> = ParamArgs<P> &
  MethodArg<M> &
  QueryArg<QueryOfHandler<HandlerOf<P, M>>> &
  BodyArg<M, BodyOfHandler<HandlerOf<P, M>>> & { headers?: HeadersInit; signal?: AbortSignal }
type RequestArgs<P extends string, M extends HttpMethod> =
  {} extends RequestOptions<P, M>
    ? [options?: RequestOptions<P, M>]
    : [options: RequestOptions<P, M>]

type ReturnedBy<H> = typeof answerOf extends keyof H
  ? NonNullable<H[typeof answerOf & keyof H]>
  : H extends readonly [...unknown[], infer Last]
    ? Returned<Last>
    : Returned<H>
type Returned<F> = F extends (...args: never[]) => infer R ? Exclude<Awaited<R>, void> : unknown
// Hono's `c.json(data)` is a `TypedResponse` whose data is already what JSON makes of it (a `Date` is a string). Any
// other answer is `unknown`.
type AnswerOfResponse<R> = [R] extends [never]
  ? unknown
  : [R] extends [TypedResponse<unknown, StatusCode, 'json'>]
    ? R extends TypedResponse<infer T, StatusCode, 'json'>
      ? T
      : never
    : unknown
type AnswerOf<P extends string, M extends string> = Loose extends true
  ? unknown
  : AnswerOfResponse<ReturnedBy<HandlerOf<P, M>>>

/** A non-2xx answer: `status`, `data` (the parsed body) and the `response`. */
export class RequestError extends Error {
  readonly status: number
  readonly data: unknown
  readonly response: Response
  constructor(method: string, url: string, response: Response, data: unknown) {
    super(`${method} ${url}: ${response.status}`)
    this.name = 'RequestError'
    this.status = response.status
    this.data = data
    this.response = response
  }
}

/**
 * Calls a `.ts` route of the app from the browser, typed by the route file. A non-2xx answer throws a `RequestError`.
 * Called during the server render, it throws.
 */
export async function request<
  P extends ApiPath,
  M extends MethodsOf<P> & HttpMethod = Extract<MethodsOf<P>, 'GET'>,
>(path: P, ...[options]: RequestArgs<P, M>): Promise<AnswerOf<P, M>> {
  if (typeof document === 'undefined')
    throw new Error(
      "fondu: request() from fondu/client is for the browser (effects, events); a page's data comes from its loader or defer()",
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
  const response = await fetch(url, {
    method,
    headers: all,
    body: JSON.stringify(body),
    signal,
  })
  const data = await readAnswer(response)
  if (!response.ok) throw new RequestError(method, url, response, data)
  return data as AnswerOf<P, M>
}

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
