import type { ExecutionContext, Hono } from 'hono'

import { fillPattern, PAGE_DATA, pathOfPageData } from '../paths.js'

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
    if (!(c.env as Record<string, unknown> | undefined)?.FONDU_PRERENDER) return c.notFound()
    return c.json({ version, ...(await prerenderPaths(routes())) })
  })
}
