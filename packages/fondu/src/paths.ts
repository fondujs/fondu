/**
 * `routes/` file → URL pattern (Hono syntax). Shared by the runtime (`createApp`) and the type generator.
 *
 * - `index.ts` is its directory: `routes/users/index.ts` → `/users`
 * - `[id]` → `:id`, `[...path]` → `:path{.+}` (one or more segments)
 * - `(group)` directories group files without a URL segment
 * - `_middleware.ts` applies to its directory
 */
export function routePattern(file: string): string {
  const segments = file
    .replace(/\.ts$/, '')
    .split('/')
    .filter((s) => s !== '' && s !== 'index' && !/^\(.+\)$/.test(s))
    .map((s) => s.replace(/^\[\.\.\.(\w+)\]$/, ':$1{.+}').replace(/^\[(\w+)\]$/, ':$1'))
  return '/' + segments.join('/')
}

/** a path inside `routes/` that is a route file: every `.ts` file but `_middleware.ts`, tests and declarations */
export function isRouteFile(file: string): boolean {
  return (
    file.endsWith('.ts') &&
    !file.endsWith('.d.ts') &&
    !/\.(test|spec)\.ts$/.test(file) &&
    file.split('/').at(-1) !== '_middleware.ts'
  )
}

/** a path inside `pages/` that is a page: a .tsx, .jsx or .mdx file whose name doesn't start with `_` (`_layout.tsx`) */
export function isPageFile(file: string): boolean {
  return /\.(?:[jt]sx|mdx)$/.test(file) && !file.split('/').at(-1)!.startsWith('_')
}

/** the directories of `pages/` whose `_layout.tsx` wraps a page, outermost first: `docs/intro.mdx` → `['', 'docs']` */
export function layoutsOf(file: string): string[] {
  const dirs = file.split('/').slice(0, -1)
  return ['', ...dirs.map((_, i) => dirs.slice(0, i + 1).join('/'))]
}

/** the `_middleware.ts` files that apply to a route file, outermost first */
export function middlewareFor(file: string, middleware: readonly string[]): string[] {
  const dirs = file.split('/').slice(0, -1)
  const out: string[] = []
  for (let i = 0; i <= dirs.length; i++) {
    const candidate = [...dirs.slice(0, i), '_middleware.ts'].join('/')
    if (middleware.includes(candidate)) out.push(candidate)
  }
  return out
}

/** `/users/:id` + `{ id: 7 }` → `/users/7`; catch-alls keep their slashes */
export function fillPattern(pattern: string, params: Record<string, string | number> = {}): string {
  return pattern.replace(/:(\w+)(\{[^}]*\})?/g, (_, name: string, catchAll?: string) => {
    const value = params[name]
    if (value === undefined) throw new Error(`fondu: missing param "${name}" for ${pattern}`)
    const parts = catchAll ? String(value).split('/') : [String(value)]
    if (parts.some((p) => p === '' || p === '.' || p === '..'))
      throw new Error(`fondu: param "${name}" is not a path segment: ${JSON.stringify(value)}`)
    return parts.map(encodeURIComponent).join('/')
  })
}

/** where prerendered pages keep their page objects (`fondu({ prerender: true })`) */
export const PAGE_DATA = '/_fondu/pages'

/** a page's URL path → the URL of its page object: `/docs/intro` → `/_fondu/pages/docs/intro.json` (`/` → `/index`) */
export function pageDataPath(path: string): string {
  return `${PAGE_DATA}${path.endsWith('/') ? path + 'index' : path}.json`
}

/** the other way: `/_fondu/pages/docs/intro.json` → `/docs/intro`; null for any other path */
export function pathOfPageData(pathname: string): string | null {
  const m = pathname.match(/^\/_fondu\/pages(\/.+)\.json$/)
  return m ? m[1]!.replace(/\/index$/, '/') : null
}
