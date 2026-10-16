import { back, defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

import { m } from '#/paraglide/messages.js'
import { baseLocale, getLocale, locales, localizeHref, type Locale } from '#/paraglide/runtime.js'

// One file, a URL per language (routes/[[locale]]/): the messages, the formats and the flash in the URL's language
export const loader = defineHandler((c) => {
  const locale = getLocale()
  const url = (to: Locale) => new URL(localizeHref('/i18n', { locale: to }), c.req.url).href
  return render(c, 'i18n', {
    rendered: locale,
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
      Date.UTC(2026, 9, 16),
    ),
    price: new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(1234.5),
    // the page in each language, for search engines: <link rel="alternate" hreflang>
    alternates: {
      ...Object.fromEntries(locales.map((l) => [l, url(l)])),
      'x-default': url(baseLocale),
    },
  })
})

// the error, a message function: called as the body is checked, in the request's language
const name = z
  .string()
  .check(z.trim(), z.minLength(1, { error: () => m.name_required() }), z.maxLength(40))

export const action = defineHandler.withValidator({ body: z.object({ name }) })((c, { body }) => {
  flash(c, { message: m.said_hello({ name: body.name }) })
  return back(c)
})
