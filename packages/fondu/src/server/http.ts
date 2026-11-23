import type { Context, MiddlewareHandler } from 'hono'

/** a navigation of fondu/client: it wants the page as JSON */
export const isPageRequest = (c: Context) => c.req.header('x-fondu') === 'true'

/** a navigation or a document load (gets a page), not an API client (gets data) */
export const wantsPage = (c: Context) =>
  isPageRequest(c) || (c.req.header('accept') ?? '').includes('text/html')

export function varyAccept(res: Response): Response {
  if (/(?:^|,)\s*(?:accept|\*)\s*(?:,|$)/i.test(res.headers.get('vary') ?? '')) return res
  try {
    res.headers.append('Vary', 'Accept')
    return res
  } catch {
    // headers that can't change (a `fetch()`'s): a copy
    const copy = new Response(res.body, res)
    copy.headers.append('Vary', 'Accept')
    return copy
  }
}

/** the request's Content Security Policy nonce (hono/secure-headers'), if it has one */
export const nonceOf = (c: Context) =>
  (c.get as (key: string) => unknown)('secureHeadersNonce') as string | undefined

/** https, directly or behind a proxy that says so (`X-Forwarded-Proto`; the proxy's word is read, never `X-Forwarded-Host`) */
export const isSecure = (c: Context) =>
  new URL(c.req.url).protocol === 'https:' ||
  c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https'

/** the `Host` the browser asked for: behind a proxy that terminates TLS, the request's URL has the scheme of the hop */
const hostOf = (c: Context) => (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase()

/** the path and query of a URL, as a redirect to this site: one leading slash (`//evil.com` is another site's) */
export const pathAndQuery = (url: URL) => url.pathname.replace(/^\/+/, '/') + url.search

/**
 * `url` as a URL of this site, or null (another site, unparsable). Hosts are compared, not origins: behind a proxy
 * that terminates TLS the request's URL is `http://` while the browser's `Referer` is `https://`.
 */
export function sameOrigin(c: Context, url: string | undefined): URL | null {
  if (!url) return null
  try {
    const parsed = new URL(url, c.req.url)
    return parsed.host === new URL(c.req.url).host || parsed.host === hostOf(c) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The page the request came from (its `Referer`) as a URL: only its path and query are ever used. A request the
 * browser says is `Sec-Fetch-Site: same-origin` came from a page of this site; else its host must be this site's.
 */
export function referer(c: Context): URL | null {
  const url = c.req.header('referer')
  if (c.req.header('sec-fetch-site') !== 'same-origin') return sameOrigin(c, url)
  try {
    return url ? new URL(url, c.req.url) : null
  } catch {
    return null
  }
}

/** Back to the page the request came from (303), or `fallback` when there is none on this site. */
export const back = (c: Context, fallback = '/') => {
  const from = referer(c)
  return c.redirect(from ? pathAndQuery(from) : fallback, 303)
}

/**
 * The trailing-slash redirect, for a GET or HEAD no route answered (404): a 301 to the path with its slash taken off
 * (`'trim'`) or put on (`'append'`). Its Location is relative, the path as it was asked (encoded) and the query:
 * behind a proxy the request's URL has another scheme than the browser's. One leading slash (`//evil.com/` is
 * `/evil.com`, never another site).
 */
export const trailingSlash =
  (append: boolean): MiddlewareHandler =>
  async (c, next) => {
    await next()
    if (c.res.status !== 404 || (c.req.method !== 'GET' && c.req.method !== 'HEAD')) return
    const url = new URL(c.req.url)
    if (url.pathname === '/' || url.pathname.endsWith('/') === append) return
    url.pathname = append ? `${url.pathname}/` : url.pathname.slice(0, -1)
    c.res = c.redirect(pathAndQuery(url), 301)
  }

/**
 * `hono/csrf`'s fallback for a browser without `Sec-Fetch-Site`: an `Origin` with this request's `Host`, and its scheme
 * (`https` too when a proxy says so). Hono compares it with the request's URL, `http://` behind a proxy.
 */
export const csrfOrigin = (origin: string, c: Context): boolean => {
  try {
    const parsed = new URL(origin)
    return (
      parsed.origin === origin &&
      parsed.host === hostOf(c) &&
      (parsed.protocol === new URL(c.req.url).protocol ||
        (parsed.protocol === 'https:' && isSecure(c)))
    )
  } catch {
    return false
  }
}

/**
 * A header added to the response a handler returned. Hono's `c.header()` would copy that response first, and on Bun
 * the copy of `new Response('text')` (`c.text()`) has no Content-Type: browsers download it. Its own headers, then,
 * unless they can't change (a `fetch()`'s): the copy.
 */
export function appendHeader(c: Context, name: string, value: string) {
  try {
    c.res.headers.append(name, value)
  } catch {
    c.header(name, value, { append: true })
  }
}

/** the build is prerendering (`FONDU_PRERENDER`: a Worker binding, or the environment of `node` / `bun dist/server/index.js`) */
export const isPrerendering = (c: Context) =>
  Boolean(
    (c.env as Record<string, unknown> | undefined)?.FONDU_PRERENDER ??
    globalThis.process?.env?.FONDU_PRERENDER,
  )
