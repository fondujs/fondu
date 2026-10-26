import type { Context } from 'hono'

/** a navigation of fondu/client: it wants the page as JSON */
export const isPageRequest = (c: Context) => c.req.header('x-fondu') === 'true'

/** a navigation or a document load (gets a page), not an API client (gets data) */
export const wantsPage = (c: Context) =>
  isPageRequest(c) || (c.req.header('accept') ?? '').includes('text/html')

/** `url` as a URL of this site, or null (another site, unparsable) */
export function sameOrigin(c: Context, url: string | undefined): URL | null {
  if (!url) return null
  try {
    const parsed = new URL(url, c.req.url)
    return parsed.origin === new URL(c.req.url).origin ? parsed : null
  } catch {
    return null
  }
}

/** Back to the page the request came from (303), or `fallback` when there is none on this site. */
export const back = (c: Context, fallback = '/') => {
  const from = sameOrigin(c, c.req.header('referer'))
  return c.redirect(from ? from.pathname.replace(/^\/+/, '/') + from.search : fallback, 303)
}
