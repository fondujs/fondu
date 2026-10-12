/**
 * Inertia's prop types (the names are Inertia's: what the client docs call them). A plain value is always sent;
 * a function is called only when its prop is sent.
 *
 * - `optional(fn)`: never on a full visit, only when a partial reload asks for it
 * - `always(value)`: sent on partial reloads too, even when not asked for
 * - `defer(fn, { group?, rescue? })`: left out of the page, fetched by the client right after it renders (one
 *   request per group); `rescue`: if it throws, the page still loads and `<Deferred>` shows its `rescue` slot
 * - `merge(value)` / `prepend(value)` / `deepMerge(value)`: partial reloads merge into what the client holds
 * - `once(fn, { key?, ttl?, fresh? })`: computed once; later requests say the client holds it and it is skipped
 *   (`fresh`: send it anyway)
 * - `scroll(fn, { pageName? })`: a page of a list for `<InfiniteScroll>`; `fn` returns `{ data, currentPage,
 *   previousPage, nextPage }` for the page in the query (`?page=`)
 */
const PROP = Symbol.for('fondu.prop')

type Resolver<T> = () => T | Promise<T>
export type Lazy<T> = T | Resolver<T>

export interface Paginated<T> {
  data: T[]
  currentPage: number | string
  previousPage: number | string | null
  nextPage: number | string | null
}

export type PropSpec =
  | { [PROP]: 'optional'; value: Lazy<unknown> }
  | { [PROP]: 'always'; value: Lazy<unknown> }
  | { [PROP]: 'defer'; value: Lazy<unknown>; group: string; rescue: boolean }
  | { [PROP]: 'merge'; value: Lazy<unknown>; strategy: 'append' | 'prepend' | 'deep'; matchOn: string[] }
  | { [PROP]: 'once'; value: Lazy<unknown>; key?: string; ttl?: number; fresh?: boolean }
  | { [PROP]: 'scroll'; value: Lazy<unknown>; pageName: string }

/** A prop with an Inertia behaviour; at the type level it stands for the value it resolves to. */
export type Prop<T> = T & { readonly [PROP]?: never }

const make = <T>(spec: PropSpec) => spec as unknown as Prop<T>

export const optional = <T>(value: Resolver<T>) => make<T>({ [PROP]: 'optional', value })
export const always = <T>(value: Lazy<T>) => make<T>({ [PROP]: 'always', value })
export const defer = <T>(value: Resolver<T>, { group = 'default', rescue = false }: { group?: string; rescue?: boolean } = {}) =>
  make<T>({ [PROP]: 'defer', value, group, rescue })
export const once = <T>(value: Resolver<T>, options: { key?: string; ttl?: number; fresh?: boolean } = {}) => make<T>({ [PROP]: 'once', value, ...options })
export const scroll = <T>(value: Resolver<Paginated<T>>, { pageName = 'page' }: { pageName?: string } = {}) =>
  make<Paginated<T>>({ [PROP]: 'scroll', value, pageName })

const merger = (strategy: 'append' | 'prepend' | 'deep') =>
  <T>(value: Lazy<T>, options: { matchOn?: string | string[] } = {}) =>
    make<T>({ [PROP]: 'merge', value, strategy, matchOn: [options.matchOn ?? []].flat() })
export const merge = merger('append')
export const prepend = merger('prepend')
export const deepMerge = merger('deep')

export const propSpec = (value: unknown): PropSpec | null =>
  typeof value === 'object' && value !== null && PROP in value ? (value as PropSpec) : null

export const kindOf = (spec: PropSpec) => spec[PROP]

export const resolve = async (value: Lazy<unknown>) => (typeof value === 'function' ? (value as Resolver<unknown>)() : value)
