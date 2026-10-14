import type { ExecutionContext, Hono } from 'hono'

import { fillPattern, PAGE_DATA, pathOfPageData, staticFiles } from '../paths.js'
import { isInertia } from './http.js'

/** `export const prerender` of a route or a `_middleware.ts`: the params of a dynamic route's pages, or on / off */
export type Prerender =
  | boolean
  | (() => Array<Record<string, string | number>> | Promise<Array<Record<string, string | number>>>)

export interface PrerenderRoute {
  file: string
  pattern: string
  /** the route's own setting, then its directories' (`_middleware.ts`), nearest first */
  settings: Array<Prerender | undefined>
  /** it answers GET (`loader` / `GET`) */
  get: boolean
  /** the other methods it answers: a static file would answer them 405 */
  others: string[]
}

/** Node / Bun: reads a file of the client build (`docs/intro.html`), or null; set by the built server's entry */
const STATIC_FILES = Symbol.for('fondu.staticFiles')
type StaticFiles = (file: string) => Promise<Uint8Array | null>

/** The paths to prerender, and what stops a route from being prerendered (the build fails on those) */
export async function prerenderPaths(routes: PrerenderRoute[]): Promise<{ paths: string[]; problems: string[] }> {
  const paths = new Set<string>()
  const problems: string[] = []
  for (const route of routes) {
    const setting = route.settings.find((s) => s !== undefined) ?? false
    if (setting === false || !route.get) continue
    const where = `routes/${route.file}`
    if (route.others.length) {
      problems.push(
        `${where} takes ${route.others.join(', ')}: a prerendered URL is a static file, which answers them 405. ` +
          `Post to another route, or \`export const prerender = false\``,
      )
      continue
    }
    const dynamic = route.pattern.includes(':')
    if (setting === true) {
      if (dynamic)
        problems.push(
          `${where} is dynamic: \`export const prerender = () => [{ …params }]\` lists its pages, or \`= false\``,
        )
      else paths.add(route.pattern)
      continue
    }
    try {
      for (const params of await setting()) paths.add(fillPattern(route.pattern, params))
    } catch (error) {
      problems.push(`${where}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { paths: [...paths].sort(), problems }
}

/**
 * `fondu({ prerender: true })`: the page object of a page without a static file (`/_fondu/pages/x.json` → `/x`, as
 * a visit), and, while the build prerenders (`FONDU_PRERENDER` set), the paths to write.
 */
export function prerenderRoutes(app: Hono, routes: () => PrerenderRoute[], version: string | null) {
  // Node / Bun: a prerendered page from its file, before the routes and behind the app's security headers (on
  // Cloudflare, Workers Static Assets serve the files before the Worker runs). The built server says how to read them.
  app.use(async (c, next) => {
    const read = (globalThis as Record<symbol, unknown>)[STATIC_FILES] as StaticFiles | undefined
    if (!read || (c.req.method !== 'GET' && c.req.method !== 'HEAD')) return next()
    const data = pathOfPageData(c.req.path) !== null // a visit, rewritten to the page object by fondu/client
    if (!data && (isInertia(c) || !(c.req.header('accept') ?? '').includes('text/html'))) return next()
    let file: string
    try {
      file = data ? decodeURIComponent(c.req.path).slice(1) : staticFiles(c.req.path).html
    } catch {
      return next() // not a path a file could have
    }
    const body = await read(file)
    if (!body) return next()
    c.header('Cache-Control', 'private, no-cache')
    if (data) c.header('X-Inertia', 'true')
    // the document's scripts had the build's nonce: this response's, as the security headers give it a new one
    const nonce = (c.get as (key: string) => unknown)('secureHeadersNonce') as string | undefined
    if (!data && nonce) {
      const html = new TextDecoder().decode(body).replace(/(<(?:script|link)\b[^>]*\snonce=")[^"]*"/gi, `$1${nonce}"`)
      return c.html(html, 200)
    }
    return c.body(body as Uint8Array<ArrayBuffer>, 200, {
      'Content-Type': data ? 'application/json' : 'text/html; charset=UTF-8',
    })
  })
  app.get(`${PAGE_DATA}/*`, (c) => {
    const path = pathOfPageData(c.req.path)
    if (!path) return c.notFound()
    const url = new URL(c.req.url)
    url.pathname = path
    const headers = new Headers(c.req.raw.headers)
    headers.set('X-Inertia', 'true')
    let ctx: ExecutionContext | undefined
    try {
      ctx = c.executionCtx
    } catch {} // none outside a Worker
    return app.fetch(new Request(url, { headers }), c.env, ctx)
  })
  app.get('/__fondu/prerender', async (c) => {
    // set for the build only: a Worker binding, or the environment of `node` / `bun dist/index.js`
    const env =
      (c.env as Record<string, unknown> | undefined)?.FONDU_PRERENDER ?? globalThis.process?.env?.FONDU_PRERENDER
    if (!env) return c.notFound()
    return c.json({ version, ...(await prerenderPaths(routes())) })
  })
}
