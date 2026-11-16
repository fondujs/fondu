import type { ExecutionContext, Hono } from 'hono'

import {
  endsInIndex,
  fillPattern,
  PAGE_DATA,
  pathOfPageData,
  PRERENDER_LIST,
  RESERVED_PREFIX,
} from '../paths.js'
import { isPrerendering } from './http.js'

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

/**
 * A param's value becomes a file name (`/items/:id` → `items/<id>.html`): not a path of its own. A `/` or a `\`
 * in it (Windows' separator) would make a directory of it, or leave the build's directory (`../../x`); a catch-all
 * is the path of its segments, each of which is a name. Throws, naming the value.
 */
function fileNames(pattern: string, params: Record<string, string | number>) {
  for (const [, name, catchAll] of pattern.matchAll(/:(\w+)(\{[^}]*\})?/g)) {
    const value = String(params[name!])
    for (const part of catchAll ? value.split('/') : [value])
      if (part === '.' || part === '..' || part.includes('\\') || (!catchAll && part.includes('/')))
        throw new Error(
          `param "${name}" is ${JSON.stringify(value)}: a prerendered URL is a file, and its names have no ` +
            `separators (/ or \\) and are not . or ..`,
        )
  }
}

/** The paths to prerender, and what stops a route from being prerendered (the build fails on those) */
export async function prerenderPaths(
  routes: PrerenderRoute[],
): Promise<{ paths: string[]; problems: string[] }> {
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
    // a page whose URL ends in index: its file would be its directory's page's (index.html), another page
    const add = (path: string) =>
      endsInIndex(path)
        ? problems.push(
            `${where}: ${path} ends in index, so its static file would be the page of its directory: ` +
              `leave it out of \`prerender\``,
          )
        : paths.add(path)
    if (setting === true) {
      if (dynamic)
        problems.push(
          `${where} is dynamic: \`export const prerender = () => [{ …params }]\` lists its pages, or \`= false\``,
        )
      else add(route.pattern)
      continue
    }
    try {
      for (const params of await setting()) {
        const path = fillPattern(route.pattern, params)
        fileNames(route.pattern, params)
        add(path)
      }
    } catch (error) {
      problems.push(`${where}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { paths: [...paths].sort(), problems }
}

/**
 * `fondu({ prerender: true })`: the page object of a page without a static file (`/_fondu/pages/x.json` → `/x`, as
 * a navigation), and, while the build prerenders (`FONDU_PRERENDER` set), the paths to write.
 */
export function prerenderRoutes(app: Hono, routes: () => PrerenderRoute[], version: string | null) {
  app.get(`${PAGE_DATA}/*`, (c) => {
    // a prefetch is for a static page's file only (served before the app, which is not reached): a page without
    // one is asked for at the click, and no loader runs for a page that may not be visited
    if (c.req.header('X-Fondu-Prefetch') === 'true')
      return c.body(null, 204, { 'Cache-Control': 'no-store' })
    const path = pathOfPageData(c.req.path)
    // a page object's own URL is not a page: no page object of a page object (and so on)
    if (!path || path.startsWith(RESERVED_PREFIX)) return c.notFound()
    const url = new URL(c.req.url)
    url.pathname = path
    const headers = new Headers(c.req.raw.headers)
    headers.set('X-Fondu', 'true')
    let ctx: ExecutionContext | undefined
    try {
      ctx = c.executionCtx
    } catch {} // none outside a Worker
    return app.fetch(new Request(url, { headers }), c.env, ctx)
  })
  app.get(PRERENDER_LIST, async (c) => {
    // set for the build only: a Worker binding, or the environment of `node` / `bun dist/server/index.js`
    if (!isPrerendering(c)) return c.notFound()
    return c.json({ version, ...(await prerenderPaths(routes())) })
  })
}
