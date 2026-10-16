/**
 * Inertia's prop types (the names are Inertia's: what the client docs call them). A plain value is always sent;
 * a function is called only when its prop is sent.
 *
 * - `optional(fn)`: never on a full visit, only when a partial reload names it (`only`)
 * - `always(value)`: sent on partial reloads too, even when not asked for
 * - `defer(fn, { group?, rescue? })`: left out of the page, fetched by the client right after it renders (one
 *   request per group); `rescue`: if it throws, the page still loads and `<Deferred>` shows its `rescue` slot
 * - `merge(value, { path?, matchOn? })` / `prepend(…)` / `deepMerge(value, { matchOn? })`: partial reloads merge into
 *   what the client holds; `path`: the list to merge, inside the prop (`'data'`); `matchOn`: the field, from the
 *   prop, that finds an item to replace (`'id'`, `'data.id'`)
 * - `once(fn, { key?, ttl?, fresh? })`: computed once; later requests say the client holds it and it is skipped
 *   (`fresh`: send it anyway)
 * - `scroll(fn, { pageName? })`: a page of a list for `<InfiniteScroll>`; `fn` returns `{ data, currentPage,
 *   previousPage, nextPage }` for the page in the query (`?page=`)
 *
 * They combine as Inertia's do (Laravel's `->once()`, `->merge()`, `->defer()`), by wrapping one in another:
 * `once(defer(fn))`, `once(optional(fn))`, `once(merge(fn))`, `merge(defer(fn))` (and `deepMerge`, `prepend`),
 * `defer(scroll(fn))`.
 */
const PROP = Symbol.for('fondu.prop')
declare const BRAND: unique symbol

type Resolver<T> = () => T | Promise<T>
export type Lazy<T> = T | Resolver<T>

export interface Paginated<T> {
  data: T[]
  currentPage: number | string
  previousPage: number | string | null
  nextPage: number | string | null
}

export interface PropSpec {
  [PROP]: true
  value: Lazy<unknown>
  optional?: true
  always?: true
  defer?: { group: string; rescue: boolean }
  once?: { key?: string; ttl?: number; fresh?: boolean }
  merge?: { strategy: 'append' | 'prepend' | 'deep'; paths: string[]; matchOn: string[] }
  scroll?: { pageName: string }
}
type Kind = Exclude<keyof PropSpec, typeof PROP | 'value'>

/** A prop with an Inertia behaviour; at the type level it stands for the value it resolves to. */
export type Prop<T> = T & { readonly [BRAND]: true }

export const propSpec = (value: unknown): PropSpec | null =>
  typeof value === 'object' && value !== null && PROP in value ? (value as PropSpec) : null

/** a new prop, or `kind` added to the one it wraps when Inertia combines them (`can`: the kinds it may wrap) */
function make<T>(name: string, value: unknown, add: Partial<PropSpec>, can: Kind[]): Prop<T> {
  const inner = propSpec(value)
  if (!inner) return { [PROP]: true, value, ...add } as unknown as Prop<T>
  const kinds = (Object.keys(inner) as Array<keyof PropSpec>).filter((k): k is Kind => k !== 'value')
  const other = kinds.find((k) => !can.includes(k))
  if (other) throw new Error(`fondu: ${name}() can't wrap ${other}()`)
  return { ...inner, ...add } as unknown as Prop<T>
}

export const optional = <T>(value: Resolver<T>) => make<T>('optional', value, { optional: true }, [])
export const always = <T>(value: Lazy<T>) => make<T>('always', value, { always: true }, [])
export const defer = <T>(
  value: Resolver<T> | Prop<T>,
  { group = 'default', rescue = false }: { group?: string; rescue?: boolean } = {},
) => make<T>('defer', value, { defer: { group, rescue } }, ['scroll'])
export const once = <T>(value: Resolver<T> | Prop<T>, options: { key?: string; ttl?: number; fresh?: boolean } = {}) =>
  make<T>('once', value, { once: options }, ['defer', 'optional', 'merge'])
export const scroll = <T>(value: Resolver<Paginated<T>>, { pageName = 'page' }: { pageName?: string } = {}) =>
  make<Paginated<T>>('scroll', value, { scroll: { pageName } }, [])

const list = (value: string | string[] | undefined) => [value ?? []].flat()
const merger =
  (strategy: 'append' | 'prepend') =>
  <T>(value: Lazy<T> | Prop<T>, options: { path?: string | string[]; matchOn?: string | string[] } = {}) =>
    make<T>(
      strategy === 'append' ? 'merge' : 'prepend',
      value,
      { merge: { strategy, paths: list(options.path), matchOn: list(options.matchOn) } },
      ['defer', 'once'],
    )
export const merge = merger('append')
export const prepend = merger('prepend')
export const deepMerge = <T>(value: Lazy<T> | Prop<T>, options: { matchOn?: string | string[] } = {}) =>
  make<T>('deepMerge', value, { merge: { strategy: 'deep', paths: [], matchOn: list(options.matchOn) } }, [
    'defer',
    'once',
  ])

export const resolve = async (value: Lazy<unknown>) =>
  typeof value === 'function' ? (value as Resolver<unknown>)() : value
