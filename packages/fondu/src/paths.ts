/**
 * `routes/` file → its URL patterns (Hono syntax). Shared by the runtime (`createApp`) and the type generator.
 *
 * - `index.ts` (or `.tsx`, `.mdx`) is its directory: `routes/users/index.ts` → `/users`
 * - `[id]` → `:id`, `[...path]` → `:path{.+}` (one or more segments)
 * - `[[lang]]`, an optional segment: two patterns, without it and with it (`/about`, `/:lang/about`), as Hono takes
 *   an optional param only at the end of a path. One per route.
 * - `(group)` directories group files without a URL segment
 * - `_middleware.ts` applies to its directory
 */
export function routePatterns(file: string): string[] {
  const parts = file.replace(ROUTE_EXTENSION, '').split('/')
  // the file named index is its directory; a directory named index is a segment like any other
  if (parts.at(-1) === 'index') parts.pop()
  const segments = parts.filter((s) => s !== '' && !/^\(.+\)$/.test(s))
  const optional = segments.filter((s) => /^\[\[(?:\.\.\.)?\w+\]\]$/.test(s))
  if (optional.some((s) => s.startsWith('[[...')))
    throw new Error(
      `fondu: routes/${file}: an optional catch-all isn't a route; index.ts and [...path].ts are`,
    )
  if (optional.length > 1)
    throw new Error(`fondu: routes/${file} has ${optional.length} optional segments; one at most`)
  const pattern = (withOptional: boolean) =>
    '/' +
    segments
      .filter((s) => withOptional || !optional.includes(s))
      .map((s) =>
        s
          .replace(/^\[\[(\w+)\]\]$/, ':$1')
          .replace(/^\[\.\.\.(\w+)\]$/, ':$1{.+}')
          .replace(/^\[(\w+)\]$/, ':$1'),
      )
      .join('/')
  return optional.length ? [pattern(false), pattern(true)] : [pattern(true)]
}

const ROUTE_EXTENSION = /\.(?:ts|[jt]sx|mdx)$/

/**
 * a path inside `routes/` that is a route file: `.ts` (server code: handlers) or `.tsx`, `.jsx`, `.mdx` (a page), but
 * tests and declarations, and neither its name nor a directory on its path starting with `_` (`_middleware.ts`,
 * `_layout.tsx`, `_parts/badge.tsx`)
 */
export function isRouteFile(file: string): boolean {
  return (
    ROUTE_EXTENSION.test(file) &&
    !file.endsWith('.d.ts') &&
    !/\.(?:test|spec)\.(?:ts|[jt]sx)$/.test(file) &&
    !file.split('/').some((s) => s.startsWith('_'))
  )
}

/** a route file that is a page (React: `.tsx`, `.jsx`, `.mdx`), not server code only (`.ts`) */
export const isPageFile = (file: string) => isRouteFile(file) && !file.endsWith('.ts')

/** a page's id, its route file without the extension: `users/[id].tsx` → `users/[id]` (the client's name for it) */
export const pageId = (file: string) => file.replace(ROUTE_EXTENSION, '')

/** the directories of `routes/` whose `_layout.tsx` wraps a page, outermost first: `docs/intro.mdx` → `['', 'docs']` */
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

/** fondu/client's scroll positions: each history entry's key in `history.state`, its position in sessionStorage */
export const SCROLL_KEY = '__fondu'
export const SCROLL_STORAGE = 'fondu-scroll:'

/** where prerendered pages keep their page objects (`fondu({ prerender: true })`) */
export const PAGE_DATA = '/_fondu/pages'

/**
 * a page's URL path → the URL of its page object: `/docs/intro` → `/_fondu/pages/docs/intro.json`, `/` →
 * `/_fondu/pages.json`. A trailing slash is left out: an app's pages have one or don't (`trailingSlash`), so
 * `/docs/` and `/docs` are never two pages, while `/docs/index` (a param's value) is another one
 */
export function pageDataPath(path: string): string {
  return `${PAGE_DATA}${path.replace(/\/$/, '')}.json`
}

/** the other way, for an app whose pages end with a slash (`append`) or don't; null for any other path */
export function pathOfPageData(pathname: string, append = false): string | null {
  const m = pathname.match(/^\/_fondu\/pages((?:\/.+)?)\.json$/)
  if (!m) return null
  return append ? `${m[1]}/` : m[1] || '/'
}

/** the files of a prerendered page: `/docs/intro` → `docs/intro.html` and `_fondu/pages/docs/intro.json` (decoded) */
export function staticFiles(path: string): { html: string; json: string } {
  const html = decodeURIComponent(path.endsWith('/') ? path + 'index.html' : path + '.html').slice(
    1,
  )
  return { html, json: decodeURIComponent(pageDataPath(path)).slice(1) }
}
