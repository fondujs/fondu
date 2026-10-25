import { defineMiddleware } from 'fondu'
import { getCookie } from 'hono/cookie'

import {
  baseLocale,
  cookieName,
  extractLocaleFromHeader,
  locales,
  localizeHref,
  toLocale,
} from '#/paraglide/runtime.js'
import { paraglideMiddleware } from '#/paraglide/server.js'

// The pages in several languages: /i18n in English (the base language), /de/i18n, /zh/i18n. Any other first
// segment is not theirs (a 404).
export const params = { locale: locales.filter((locale) => locale !== baseLocale) }

export default defineMiddleware(async (c, next) => {
  const unprefixed = c.req.param('locale') === undefined
  // Asked for in the base language, without its prefix: the language picked (setLocale's cookie), or the browser's
  // if it is one of ours. A page load or a navigation (the menu's link has no prefix); a URL with one opens as it is.
  if (unprefixed && c.req.method === 'GET') {
    const locale = toLocale(getCookie(c, cookieName)) ?? extractLocaleFromHeader(c.req.raw)
    if (locale && locale !== baseLocale) {
      c.header('Vary', 'Accept-Language, Cookie')
      return c.redirect(localizeHref(c.req.path + new URL(c.req.url).search, { locale }), 302)
    }
  }
  // The request's language, for m.*() and getLocale() in this request (AsyncLocalStorage). Paraglide gets the
  // path as the router read it (percent-decoded), so both see the same language, and no body: it reads the URL
  // and the headers only.
  const url = new URL(c.req.url)
  url.pathname = c.req.path
  const res = await paraglideMiddleware(
    new Request(url, { headers: c.req.raw.headers }),
    async () => {
      await next()
      return c.res
    },
  )
  if (unprefixed) res.headers.append('Vary', 'Accept-Language, Cookie')
  return res
})
