import { fillPattern } from './paths.js'
import type { schemasOf } from './server/handler.js'
import type { Routes } from './types.js'

/**
 * Typed URLs from `app/routes/` (as React Router's `href`): `href('/users/:id', { id })` → `'/users/7'`;
 * one of a file's `actions`: `href('/users/:id?delete', { id })`. Only patterns that exist; params are required.
 * A form's action too: `<form method="post" action={href('/logout')}>`. With `query` (typed by the route's
 * `withValidator({ query })`, if it has one) and `hash`: `href('/search', { query: { q }, hash: 'results' })`.
 */
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
type QueryOf<P extends string> =
  HandlersOf<P> extends { readonly [schemasOf]?: infer S }
    ? S extends { query: { '~standard': { types?: infer T } } }
      ? NonNullable<T> extends { input: infer I extends object }
        ? { [K in keyof I]: unknown extends I[K] ? QueryValue : I[K] }
        : Record<string, QueryValue>
      : Record<string, QueryValue>
    : Record<string, QueryValue>
/** `query` is required when its schema requires a field */
type Extra<P extends string> = { hash?: string } & ({} extends QueryOf<P>
  ? { query?: QueryOf<P> }
  : { query: QueryOf<P> })
type Args<P extends string> = [ParamNames<P>] extends [never]
  ? {} extends QueryOf<P>
    ? [options?: Extra<P>]
    : [options: Extra<P>]
  : [params: { [K in ParamNames<P>]: string | number } & Extra<P>]

export function href<P extends Href>(path: P, ...[options]: Args<P>): string {
  const { query, hash, ...params } = (options ?? {}) as {
    query?: Record<string, unknown>
    hash?: string
    [param: string]: unknown
  }
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
  __entry,
  renderPage,
  type Errors,
  type Navigation,
} from './client/app.js'
export { useForm } from './client/form.js'
export { loadDocument, navigate, type Page } from './client/navigation.js'
export type { ProgressOptions } from './client/progress.js'
