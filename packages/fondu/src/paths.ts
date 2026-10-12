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
  return file.endsWith('.ts') && !file.endsWith('.d.ts') && !/\.(test|spec)\.ts$/.test(file) && file.split('/').at(-1) !== '_middleware.ts'
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
    if (parts.some((p) => p === '' || p === '.' || p === '..')) throw new Error(`fondu: param "${name}" is not a path segment: ${JSON.stringify(value)}`)
    return parts.map(encodeURIComponent).join('/')
  })
}
