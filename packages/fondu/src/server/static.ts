import type { Context, MiddlewareHandler } from 'hono'
import { getPath } from 'hono/utils/url'

import { endsInIndex, htmlFile, PAGE_DATA } from '../paths.js'
import { isPageRequest } from './http.js'

export type ServeStatic = (options: {
  root: string
  rewriteRequestPath?: (path: string) => string
}) => MiddlewareHandler

// the runtimes differ in when serveStatic's `onFound` could set headers
const withHeaders = (res: Response, headers: Record<string, string>) => {
  for (const [name, value] of Object.entries(headers)) res.headers.set(name, value)
}

// Prerendered pages and files as files, before the app. A URL ending in `index` is never a document file, and a path with an
// escaped reserved character (`%2F`) after decoding is refused by serveStatic and left to the app.
export function staticPages(
  serveStatic: ServeStatic,
  clientRoot: string,
  headers: Record<string, string>,
  files: string[] = [],
): MiddlewareHandler {
  // The manifest has URLs, while c.req.path has already been decoded by Hono.
  const named = new Set(files.map((path) => getPath(new Request('http://localhost' + path))))
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
  const file = serve(pageObject, { 'Cache-Control': 'private, no-cache' })
  return (c, next) => {
    if ((c.req.method !== 'GET' && c.req.method !== 'HEAD') || c.req.path.includes('\0'))
      return next()
    if (c.req.path.startsWith(`${PAGE_DATA}/`)) return pages(c, next)
    if (named.has(c.req.path)) return file(c, next)
    if (
      isPageRequest(c) ||
      !(c.req.header('accept') ?? '').includes('text/html') ||
      endsInIndex(c.req.path)
    )
      return next()
    return documents(c, next)
  }
}
