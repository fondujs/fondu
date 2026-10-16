import type { Handler, MiddlewareHandler } from 'hono'

import { isRouteFile, middlewareFor, routePatterns } from '../paths.js'
import type { Prerender } from './prerender.js'

export type Handlers = Handler | MiddlewareHandler | ReadonlyArray<Handler | MiddlewareHandler>

/** `export const params` (a route or a `_middleware.ts`): the values a param of its routes takes */
export type Params = Record<string, readonly string[]>

export interface RouteModule {
  /** `fondu({ prerender: true })`: written as static files at build time (also in a `_middleware.ts`) */
  prerender?: Prerender
  /** the values its params take, `{ lang: ['de', 'fr'] }`, any other not its URL (also in a `_middleware.ts`) */
  params?: Params
  /** a `_middleware.ts`: the middleware */
  default?: Handlers
  loader?: Handlers
  action?: Handlers
  actions?: Record<string, Handlers>
  GET?: Handlers
  POST?: Handlers
  PUT?: Handlers
  PATCH?: Handlers
  DELETE?: Handlers
  OPTIONS?: Handlers
}

export interface Route {
  file: string
  /** what Hono matches: `/:lang{(?:de|fr)}/about` */
  pattern: string
  /** the URL pattern of fondu.gen.d.ts and `href()`: `/:lang/about` */
  path: string
  /** its directories' `_middleware.ts` files, outermost first (the root's applies to every request: not listed) */
  middleware: string[]
}

/** a value of `params`: a URL segment of unreserved characters, matched as it is (Hono decodes the path first) */
const SEGMENT = /^[\w.~-]+$/

/**
 * The routes of `app/routes/` (`modules`: file inside routes/ → its module), in the order Hono gets them: segment
 * by segment, static before a param with listed values, before any param, before a catch-all. Throws, at startup,
 * on what would answer the wrong way: two files for the same URLs (one would never answer, or answer without the
 * other's middleware), `params` that no route takes or that aren't single segments.
 */
export function routeTable(modules: Record<string, RouteModule>, append: boolean): Route[] {
  const files = Object.keys(modules)
  const middlewareFiles = files.filter((f) => f.endsWith('/_middleware.ts'))
  const used = new Set<string>() // `${file}:${name}`: a `params` entry that applies to a route
  const routes: Route[] = []
  for (const file of files.filter(isRouteFile)) {
    // the values of each param: the root's _middleware.ts, its directories', its own; the nearest counts
    const values = new Map<string, { list: readonly string[]; from: string }>()
    for (const from of [...middlewareFor(file, [...middlewareFiles, '_middleware.ts']), file])
      for (const [name, list] of Object.entries(paramsOf(from, modules[from])))
        values.set(name, { list, from })
    const paths = routePatterns(file)
      .map((path) => {
        let empty = false
        const pattern = path.replace(
          /:(\w+)(\{[^}]*\})?/g,
          (param, name: string, regex?: string) => {
            const listed = values.get(name)
            if (!listed) return param
            used.add(`${listed.from}:${name}`)
            if (regex)
              throw new Error(
                `fondu: routes/${listed.from}: params.${name} lists the values of one segment, and routes/${file} has [...${name}]`,
              )
            if (listed.list.length === 0) empty = true
            return `:${name}{(?:${listed.list.map((v) => v.replaceAll('.', '\\.')).join('|')})}`
          },
        )
        return empty ? null : { path: withSlash(path, append), pattern: withSlash(pattern, append) }
      })
      .filter((p) => p !== null)
    if (!paths.length)
      throw new Error(`fondu: routes/${file} has no URL: a param of it lists no values (params)`)
    const middleware = middlewareFor(file, middlewareFiles)
    for (const { path, pattern } of paths) routes.push({ file, path, pattern, middleware })
  }

  for (const from of files)
    for (const name of Object.keys(paramsOf(from, modules[from])))
      if (!used.has(`${from}:${name}`))
        throw new Error(
          `fondu: routes/${from} exports params.${name}, but no route it applies to has [${name}] or [[${name}]]`,
        )

  // the same URLs: the same pattern but for the names of its params
  const byKey = new Map<string, Route>()
  for (const route of routes) {
    const key = route.pattern.replace(/(?<=\/):\w+/g, ':')
    const other = byKey.get(key)
    if (other && other.file !== route.file)
      throw new Error(
        `fondu: routes/${other.file} (${other.path}) and routes/${route.file} (${route.path}) answer the same URLs. ` +
          (other.path === route.path
            ? 'One file per URL'
            : 'Move one, or list the values of a param: `export const params = { name: [...] }`'),
      )
    byKey.set(key, route)
  }
  return routes.sort((a, b) => rank(a.pattern).localeCompare(rank(b.pattern)))
}

function paramsOf(file: string, mod: RouteModule | undefined): Params {
  const params: unknown = mod?.params
  if (params === undefined) return {}
  if (typeof params !== 'object' || params === null || Array.isArray(params))
    throw new Error(`fondu: routes/${file}: params is an object, \`{ name: ['value', …] }\``)
  for (const [name, list] of Object.entries(params))
    if (
      !Array.isArray(list) ||
      list.some((v) => typeof v !== 'string' || !SEGMENT.test(v) || v === '.' || v === '..')
    )
      throw new Error(
        `fondu: routes/${file}: params.${name} lists URL segments, of letters, digits and - . _ ~ (${JSON.stringify(list)})`,
      )
  return params as Params
}

// a catch-all takes the rest of the path: never a trailing slash
const withSlash = (pattern: string, append: boolean) =>
  append && pattern !== '/' && !pattern.endsWith('{.+}') ? pattern + '/' : pattern

/** sort key: static segments, then params with listed values, then params, then catch-alls */
const rank = (pattern: string) =>
  pattern
    .split('/')
    .map(
      (s) => (s.endsWith('{.+}') ? '3' : s.includes('{') ? '1' : s.startsWith(':') ? '2' : '0') + s,
    )
    .join('/')
