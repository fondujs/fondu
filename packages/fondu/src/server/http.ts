import type { Context } from 'hono'

export const isInertia = (c: Context) => c.req.header('x-inertia') === 'true'

/** a visit or a document load (gets a page), not an API client (gets data) */
export const wantsPage = (c: Context) => isInertia(c) || (c.req.header('accept') ?? '').includes('text/html')

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

/**
 * A full page load of `url` (another site, a non-Inertia page): Inertia's requests get 409 + `X-Inertia-Location`
 * (the client then sets `window.location`), others a plain redirect.
 */
export const location = (c: Context, url: string) =>
  isInertia(c) ? c.body(null, 409, { 'X-Inertia-Location': url }) : c.redirect(url, 302)
