import type { Context, MiddlewareHandler } from 'hono'

import { endsInIndex, htmlFile, PAGE_DATA } from '../paths.js'
import { isPageRequest } from './http.js'

/** Hono's `serveStatic` of the runtime (`hono/bun`, `@hono/node-server/serve-static`), given by the built server's entry */
export type ServeStatic = (options: {
  root: string
  rewriteRequestPath?: (path: string) => string
}) => MiddlewareHandler

/** the headers on the response a file was served with (the runtimes differ in when `onFound` could set them) */
const withHeaders = (res: Response, headers: Record<string, string>) => {
  for (const [name, value] of Object.entries(headers)) res.headers.set(name, value)
}

/**
 * Node / Bun: the prerendered pages as files, before the app: a document request (`Accept: text/html`, no `X-Fondu`)
 * for `/docs/intro` is `docs/intro.html`, a page object (`/_fondu/pages/…`) its `.json`, each with the headers the
 * build decided (`headers`: `dist/server/prerender.json`). No file, or no page request: the next handler (the app).
 * A URL ending in `index` is never a document file (it would be its directory's). A path that still has an escaped
 * reserved character (`%2F`…) after decoding is not served from a file: serveStatic refuses it, and the app answers.
 */
export function staticPages(
  serveStatic: ServeStatic,
  clientRoot: string,
  headers: Record<string, string>,
): MiddlewareHandler {
  const pageObject = serveStatic({ root: clientRoot })
  const document = serveStatic({ root: clientRoot, rewriteRequestPath: htmlFile })
  const serve =
    (middleware: MiddlewareHandler, own: Record<string, string>) =>
    async (c: Context, next: () => Promise<void>) => {
      const res: unknown = await middleware(c, next)
      if (res instanceof Response) withHeaders(res, { ...headers, ...own })
      return res as Response | undefined
    }
  const pages = serve(pageObject, { 'Cache-Control': 'private, no-cache', 'X-Fondu': 'true' })
  const documents = serve(document, { 'Cache-Control': 'private, no-cache' })
  return (c, next) => {
    if ((c.req.method !== 'GET' && c.req.method !== 'HEAD') || c.req.path.includes('\0'))
      return next()
    if (c.req.path.startsWith(`${PAGE_DATA}/`)) return pages(c, next)
    if (
      isPageRequest(c) ||
      !(c.req.header('accept') ?? '').includes('text/html') ||
      endsInIndex(c.req.path)
    )
      return next()
    return documents(c, next)
  }
}
