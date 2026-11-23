import type { Context, MiddlewareHandler } from 'hono'

export const isPageRequest = (c: Context) => c.req.header('x-fondu') === 'true'

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

export const nonceOf = (c: Context) =>
  (c.get as (key: string) => unknown)('secureHeadersNonce') as string | undefined

// the proxy's `X-Forwarded-Proto` is read, never `X-Forwarded-Host`
export const isSecure = (c: Context) =>
  new URL(c.req.url).protocol === 'https:' ||
  c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https'

// behind a proxy that terminates TLS, the request's URL has the scheme of the hop
const hostOf = (c: Context) => (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase()

// one leading slash: `//evil.com` is another site's
export const pathAndQuery = (url: URL) => url.pathname.replace(/^\/+/, '/') + url.search

// Hosts are compared, not origins: behind a proxy that terminates TLS the request's URL is `http://` while the browser's
// `Referer` is `https://`.
export function sameOrigin(c: Context, url: string | undefined): URL | null {
  if (!url) return null
  try {
    const parsed = new URL(url, c.req.url)
    return parsed.host === new URL(c.req.url).host || parsed.host === hostOf(c) ? parsed : null
  } catch {
    return null
  }
}

// Only its path and query are used. `Sec-Fetch-Site: same-origin` came from a page of this site; else the host must be
// this site's.
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

// The Location is relative, the path as asked (encoded): behind a proxy the request's URL has another scheme than the
// browser's. One leading slash (`//evil.com/` is never another site).
export const trailingSlash: MiddlewareHandler = async (c, next) => {
  await next()
  if (c.res.status !== 404) return
  const url = new URL(c.req.url)
  if (url.pathname === '/' || !url.pathname.endsWith('/')) return
  url.pathname = url.pathname.slice(0, -1)
  // 308 keeps a POST a POST
  c.res = c.redirect(
    pathAndQuery(url),
    c.req.method === 'GET' || c.req.method === 'HEAD' ? 301 : 308,
  )
}

// Hono compares the Origin with the request's URL, `http://` behind a proxy: this also accepts `https` when a proxy says
// so.
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

// Hono's `c.header()` would copy the response first, and on Bun the copy of `new Response('text')` has no Content-Type:
// browsers download it.
export function appendHeader(c: Context, name: string, value: string) {
  try {
    c.res.headers.append(name, value)
  } catch {
    c.header(name, value, { append: true })
  }
}

// `FONDU_PRERENDER`: a Worker binding, or the environment of `node` / `bun dist/server/index.js`
export const isPrerendering = (c: Context) =>
  Boolean(
    (c.env as Record<string, unknown> | undefined)?.FONDU_PRERENDER ??
    globalThis.process?.env?.FONDU_PRERENDER,
  )
