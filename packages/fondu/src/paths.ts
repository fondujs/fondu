// `[[lang]]` is two patterns, without it and with it: Hono takes an optional param only at the end of a path
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
  // `href()` and `request()` take these as options, next to the params
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

// Throws on a character of the route syntax (`[ ] : * { } ?`) that is none of its forms: it would be a literal URL, or a
// param Hono reads. Not run in the client, which reads names that passed.
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

// the names `href()` and `request()` take as options
const RESERVED: Record<string, string | undefined> = Object.assign(Object.create(null), {
  query: 'href()',
  hash: 'href()',
  method: 'request()',
  body: 'request()',
  headers: 'request()',
  signal: 'request()',
})

const ROUTE_EXTENSION = /\.(?:tsx?|mdx)$/

const isTest = (file: string) => /\.(?:test|spec)\./.test(file.slice(file.lastIndexOf('/') + 1))

const isOwn = (segment: string) => segment.startsWith('_')

const isRouteLike = (file: string) =>
  ROUTE_EXTENSION.test(file) && !file.endsWith('.d.ts') && !isTest(file)

export function isRouteFile(file: string): boolean {
  return isRouteLike(file) && !file.split('/').some((s) => isOwn(s) || s.startsWith('.'))
}

const SPECIAL = {
  _middleware: { extension: 'ts', is: "a directory's middleware" },
  _layout: { extension: 'tsx', is: "a directory's layout" },
  _error: { extension: 'tsx', is: 'the error page' },
} as const

// The server passes the files Vite lists (its globs skip a path starting with `.`), the build every file of the
// directory.
export function checkRouteFiles(files: readonly string[]): void {
  for (const file of files) {
    const parts = file.split('/')
    if (parts.slice(0, -1).some(isOwn)) continue
    if (isRouteLike(file) && !isOwn(parts.at(-1)!) && parts.some((s) => s.startsWith('.')))
      throw new Error(
        `fondu: routes/${file}: a path starting with "." is not a route; serve it from public/ or answer it in a catch-all route`,
      )
    const match = /^(_middleware|_layout|_error)\.([^.]+)$/.exec(parts.at(-1)!)
    if (!match) continue
    const { extension, is } = SPECIAL[match[1] as keyof typeof SPECIAL]
    if (match[2] !== extension)
      throw new Error(`fondu: routes/${file}: ${is} is ${match[1]}.${extension}`)
  }
}

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const
export const HANDLERS = ['loader', 'action', 'actions'] as const
export const CONFIG = ['prerender', 'params'] as const

export const isPageFile = (file: string) => isRouteFile(file) && !file.endsWith('.ts')

export const pageId = (file: string) => file.replace(ROUTE_EXTENSION, '')

export function layoutsOf(file: string): string[] {
  const dirs = file.split('/').slice(0, -1)
  return ['', ...dirs.map((_, i) => dirs.slice(0, i + 1).join('/'))]
}

export function middlewareFor(file: string, middleware: readonly string[]): string[] {
  const dirs = file.split('/').slice(0, -1)
  const out: string[] = []
  for (let i = 0; i <= dirs.length; i++) {
    const candidate = [...dirs.slice(0, i), '_middleware.ts'].join('/')
    if (middleware.includes(candidate)) out.push(candidate)
  }
  return out
}

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

// the key in `history.state` of the scroll positions (kept in sessionStorage)
export const SCROLL_KEY = '__fondu'
export const SCROLL_STORAGE = 'fondu-scroll:'

// an app has no route under it
export const RESERVED_PREFIX = '/_fondu/'

export const PAGE_DATA = `${RESERVED_PREFIX}pages`

// answered while `FONDU_PRERENDER` is set, 404 otherwise
export const PRERENDER_LIST = `${RESERVED_PREFIX}prerender`

// One for one whatever the app's trailing slashes: a trailing slash is `index`, and a last segment named index (or
// ~index…) gets one more `~`.
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

export function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// its static file would be its directory's (`index.html`), which is another page
export const endsInIndex = (path: string) =>
  decoded(path.slice(path.lastIndexOf('/') + 1)) === 'index'

export function pathOfPageData(pathname: string): string | null {
  const m = pathname.match(/^\/_fondu\/pages(\/.+)\.json$/)
  if (!m) return null
  return m[1]!.replace(/(?<=\/)index$/, '').replace(/(?<=\/)~(~*index)$/, '$1')
}

export const htmlFile = (decodedPath: string) =>
  (decodedPath.endsWith('/') ? `${decodedPath}index.html` : `${decodedPath}.html`).slice(1)

export function staticFiles(path: string): { html: string; json: string } {
  return {
    html: htmlFile(decodeURIComponent(path)),
    json: decodeURIComponent(pageDataPath(path)).slice(1),
  }
}

// The rest of a page's code goes to modules of its own: the browser gets the page alone.
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

const INSTEAD = {
  loader: 'in a .ts file it is `GET`',
  action: 'in a .ts file it is `POST`',
  actions: "a .ts file has one `POST`: a file per action, or a page's route file (.tsx)",
}

// The server checks the exports of the loaded module at startup, the build the names in the source: one message.
export function checkExportNames(file: string, names: readonly string[]): void {
  const { allowed, hint } = exportsOf(file)
  const mdx = file.endsWith('.mdx')
  const extra = names.filter((k) =>
    mdx ? [...HANDLERS, ...METHODS, ...CONFIG].includes(k as never) : !allowed.includes(k),
  )
  if (!extra.length) return
  if (mdx && extra.includes('prerender'))
    throw new Error(
      `fondu: routes/${file}: an MDX page can't export prerender: put it in a .tsx route or a _middleware.ts`,
    )
  const renamed = file.endsWith('.ts')
    ? extra.filter((k): k is keyof typeof INSTEAD => k in INSTEAD)
    : []
  throw new Error(
    `fondu: routes/${file} exports ${extra.map((k) => `\`${k}\``).join(', ')}. It exports ${hint}` +
      (renamed.length ? ` (${renamed.map((k) => `\`${k}\`: ${INSTEAD[k]}`).join('; ')})` : ''),
  )
}
