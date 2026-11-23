/**
 * `routes/` file → its URL patterns, the keys of `fondu.gen.d.ts`, `href()` and `request()`. Shared by the runtime
 * (`createApp`, which gives Hono its own form of them) and the type generator.
 *
 * - `index.ts` (or `.tsx`, `.mdx`) is its directory: `routes/users/index.ts` → `/users`
 * - `[id]` → `:id`, `[...path]` → `:path*` (one or more segments)
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
  // the options of href() and request(), next to the params
  for (const segment of segments) {
    const name = /^\[{1,2}(?:\.\.\.)?(\w+)\]{1,2}$/.exec(segment)?.[1]
    const api = name && RESERVED[name]
    if (api)
      throw new Error(
        `fondu: routes/${file}: a param can't be named ${name} (${api}'s option); rename the file's [${name}]`,
      )
  }
  const pattern = (withOptional: boolean) =>
    '/' +
    segments
      .filter((s) => withOptional || !optional.includes(s))
      .map((s) =>
        s
          .replace(/^\[\[(\w+)\]\]$/, ':$1')
          .replace(/^\[\.\.\.(\w+)\]$/, ':$1*')
          .replace(/^\[(\w+)\]$/, ':$1'),
      )
      .join('/')
  return optional.length ? [pattern(false), pattern(true)] : [pattern(true)]
}

/**
 * Throws if a segment of a route file's path has a character of the route syntax (`[ ] : * { } ?`) and is none of its
 * forms: it would be a literal URL, or a param Hono reads. Server and build only (the client reads names that passed):
 * `routeTable` at startup, the build's page files, typegen.
 */
export function checkRouteName(file: string): void {
  for (const segment of file.replace(ROUTE_EXTENSION, '').split('/')) {
    if (
      /[[\]:*{}?]/.test(segment) &&
      !/^(?:\[\.\.\.\w+\]|\[\w+\]|\[\[(?:\.\.\.)?\w+\]\])$/.test(segment)
    )
      throw new Error(
        `fondu: routes/${file}: \`${segment}\` is not a route name. A segment is plain (\`users\`), \`[id]\`, \`[[lang]]\` or \`[...path]\` (letters, digits, _), and none of \`[ ] : * { } ?\` otherwise`,
      )
  }
}

/** the names a param can't have, and the function whose option each is: `href()`'s and `request()`'s */
const RESERVED: Record<string, string | undefined> = Object.assign(Object.create(null), {
  query: 'href()',
  hash: 'href()',
  method: 'request()',
  body: 'request()',
  headers: 'request()',
  signal: 'request()',
})

const ROUTE_EXTENSION = /\.(?:tsx?|mdx)$/

/**
 * a path inside `routes/` that is a route file: `.ts` (server code: handlers) or `.tsx`, `.mdx` (a page), but
 * tests and declarations, and neither its name nor a directory on its path starting with `_` (`_middleware.ts`,
 * `_layout.tsx`, `_parts/badge.tsx`)
 */
export function isRouteFile(file: string): boolean {
  return (
    ROUTE_EXTENSION.test(file) &&
    !file.endsWith('.d.ts') &&
    !/\.(?:test|spec)\.tsx?$/.test(file) &&
    !file.split('/').some((s) => s.startsWith('_'))
  )
}

const SPECIAL = {
  _middleware: { extension: 'ts', is: "a directory's middleware" },
  _layout: { extension: 'tsx', is: "a directory's layout" },
  _error: { extension: 'tsx', is: 'the error page' },
} as const

/** Throws for `_middleware`, `_layout` or `_error` with another extension: nothing would load it. */
export function checkSpecialFiles(files: readonly string[]): void {
  for (const file of files) {
    const parts = file.split('/')
    const match = /^(_middleware|_layout|_error)\.([^.]+)$/.exec(parts.at(-1)!)
    if (!match || parts.slice(0, -1).some((s) => s.startsWith('_'))) continue
    const { extension, is } = SPECIAL[match[1] as keyof typeof SPECIAL]
    if (match[2] !== extension)
      throw new Error(`fondu: routes/${file}: ${is} is ${match[1]}.${extension}`)
  }
}

/** what a route file exports for the server, besides its page: HTTP methods, a page's handlers, its settings */
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
export const HANDLERS = ['loader', 'action', 'actions'] as const
export const CONFIG = ['prerender', 'params'] as const

/** a route file that is a page (React: `.tsx`, `.mdx`), not server code only (`.ts`) */
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
  return pattern.replace(/:(\w+)(\*)?/g, (_, name: string, catchAll?: string) => {
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

/** the one prefix Fondu keeps for its own URLs: an app has no route under it */
export const RESERVED_PREFIX = '/_fondu/'

/** where prerendered pages keep their page objects (`fondu({ prerender: true })`) */
export const PAGE_DATA = `${RESERVED_PREFIX}pages`

/** the build's list of pages to prerender: answered while `FONDU_PRERENDER` is set, 404 otherwise */
export const PRERENDER_LIST = `${RESERVED_PREFIX}prerender`

/**
 * a page's URL path → the URL of its page object, one for one whatever the app's trailing slashes: `/docs/intro` →
 * `/_fondu/pages/docs/intro.json`; a trailing slash is `index` (`/docs/` → `…/docs/index.json`, `/` →
 * `…/index.json`), and a last segment named index (or ~index…) gets one more `~` (`/items/index` → `…/items/~index.json`)
 */
export function pageDataPath(path: string): string {
  const last = path.slice(path.lastIndexOf('/') + 1)
  // as the server reads it, decoded: `%69ndex` is index too (written as it, of unreserved characters)
  const named = path.endsWith('/')
    ? `${path}index`
    : /^~*index$/.test(decoded(last))
      ? `${path.slice(0, -last.length)}~${decoded(last)}`
      : path
  return `${PAGE_DATA}${named}.json`
}

/** a URL segment decoded, or as it is if it doesn't decode */
export function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * a path whose last segment is index (`/index`, `/docs/%69ndex`): its static file would be its directory's
 * (`index.html`, `docs/index.html`), which is another page
 */
export const endsInIndex = (path: string) =>
  decoded(path.slice(path.lastIndexOf('/') + 1)) === 'index'

/** the other way: `/_fondu/pages/docs/intro.json` → `/docs/intro`; null for any other path */
export function pathOfPageData(pathname: string): string | null {
  const m = pathname.match(/^\/_fondu\/pages(\/.+)\.json$/)
  if (!m) return null
  return m[1]!.replace(/(?<=\/)index$/, '').replace(/(?<=\/)~(~*index)$/, '$1')
}

/**
 * a prerendered page's document file from its path as a server reads it (decoded): `/docs/intro` → `docs/intro.html`,
 * `/docs/` → `docs/index.html`
 */
export const htmlFile = (decodedPath: string) =>
  (decodedPath.endsWith('/') ? `${decodedPath}index.html` : `${decodedPath}.html`).slice(1)

/** the files of a prerendered page: `/docs/intro` → `docs/intro.html` and `_fondu/pages/docs/intro.json` (decoded) */
export function staticFiles(path: string): { html: string; json: string } {
  return {
    html: htmlFile(decodeURIComponent(path)),
    json: decodeURIComponent(pageDataPath(path)).slice(1),
  }
}

/**
 * What a file of `app/routes/` may export, and what to do with anything else: one spelling per kind of file. A
 * page's route file (`.tsx`) is its page and `loader`, `action` or `actions`; a `.ts` file is server code, with the
 * HTTP methods. The rest of a page's code goes to modules of its own (the browser gets the page alone)
 */
function exportsOf(file: string): { allowed: readonly string[]; hint: string } {
  const name = file.split('/').at(-1)!
  if (name === '_middleware.ts')
    return { allowed: ['default', ...CONFIG], hint: 'its middleware (default), prerender, params' }
  if (name === '_error.tsx') return { allowed: ['default'], hint: 'its component (default)' }
  if (name === '_layout.tsx')
    return {
      allowed: ['default', 'layout'],
      hint: 'its component (default) and optional layout chain',
    }
  if (file.endsWith('.mdx'))
    return {
      allowed: [],
      hint: "its content: an MDX page has no handlers (a _middleware.ts's prerender, params)",
    }
  if (file.endsWith('.ts'))
    return {
      allowed: [...METHODS, ...CONFIG],
      hint: 'GET, POST, PUT, PATCH, DELETE, OPTIONS, prerender, params',
    }
  return {
    allowed: ['default', 'layout', ...HANDLERS, ...CONFIG],
    hint: 'its page (default), layout, loader, action or actions, prerender, params; the rest goes to a module of its own',
  }
}

/** what a page's handler is called in a `.ts` file */
const INSTEAD = {
  loader: 'in a .ts file it is `GET`',
  action: 'in a .ts file it is `POST`',
  actions: "a .ts file has one `POST`: a file per action, or a page's route file (.tsx)",
}

/**
 * Throws if a route file (`file`, relative to `routes/`) exports a name it may not. The server checks it at startup
 * (the exports of the loaded module), the build too (the names in the source): one message.
 */
export function checkExportNames(file: string, names: readonly string[]): void {
  const { allowed, hint } = exportsOf(file)
  const mdx = file.endsWith('.mdx')
  const extra = names.filter((k) =>
    mdx ? [...HANDLERS, ...METHODS, ...CONFIG].includes(k as never) : !allowed.includes(k),
  )
  if (!extra.length) return
  const renamed = file.endsWith('.ts')
    ? extra.filter((k): k is keyof typeof INSTEAD => k in INSTEAD)
    : []
  throw new Error(
    `fondu: routes/${file} exports ${extra.map((k) => `\`${k}\``).join(', ')}. It exports ${hint}` +
      (renamed.length ? ` (${renamed.map((k) => `\`${k}\`: ${INSTEAD[k]}`).join('; ')})` : ''),
  )
}
