import { back, defineHandler, flash, render } from 'fondu'
import { type Errors, href, loadDocument } from 'fondu/client'
import * as z from 'zod/mini'

import { DemoCard, SubmitButton, TextField, Title } from '#/components/demo.tsx'
import { Button } from '#/components/ui/button.tsx'
import { localizedHref } from '#/lib/i18n.ts'
import { m } from '#/paraglide/messages.js'
import {
  baseLocale,
  getLocale,
  type Locale,
  locales,
  localizeHref,
  setLocale,
} from '#/paraglide/runtime.js'

// One file, a URL per language (routes/[[locale]]/): the messages, the formats and the flash in the URL's language
export const loader = defineHandler((c) => {
  const locale = getLocale()
  const url = (to: Locale) => new URL(localizeHref('/i18n', { locale: to }), c.req.url).href
  return render(c, I18n, {
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

interface Props {
  rendered: Locale
  date: string
  price: string
  alternates: Record<string, string>
  errors: Errors
}

// each language in its own words
const names: Record<Locale, string> = { en: 'English', de: 'Deutsch', zh: '中文' }

// another language: remembered (setLocale's cookie), then the page in its URL, loaded as a document (its <html lang>)
const pick = (locale: Locale) => {
  setLocale(locale, { reload: false })
  loadDocument(localizeHref(href('/i18n'), { locale }))
}

export default function I18n({ rendered, date, price, alternates, errors }: Props) {
  const locale = getLocale() // the URL's, in the browser as on the server
  return (
    <>
      <Title>Languages</Title>
      {/* React puts them in <head> */}
      {Object.entries(alternates).map(([lang, url]) => (
        <link key={lang} rel="alternate" hrefLang={lang} href={url} />
      ))}
      <h1>Languages</h1>
      <p className="lede">
        One route file, a URL per language: <code>routes/(demos)/[[locale]]/i18n.tsx</code> answers{' '}
        <code>/i18n</code> in English, <code>/de/i18n</code> and <code>/zh/i18n</code>. The cards
        are in the URL's language, with Paraglide's messages, on the server and in the browser.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <DemoCard title="Messages" tag="m.greeting({ name }), m.books({ count })">
          <p data-testid="this-language">{m.this_language()}</p>
          <p className="mt-2 text-lg font-medium" data-testid="greeting">
            {m.greeting({ name: 'Ada' })}
          </p>
          <p className="text-muted-foreground" data-testid="books">
            {m.books({ count: 1 })} · {m.books({ count: 3 })}
          </p>
        </DemoCard>
        <DemoCard title="Formats" tag="Intl, on the server, in getLocale()">
          <p data-testid="date">{date}</p>
          <p data-testid="price">{price}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Rendered in <code data-testid="rendered">{rendered}</code>
          </p>
        </DemoCard>
        <DemoCard title="Language" tag="setLocale(): the same page, in the URL of another language">
          <div className="flex flex-wrap gap-2">
            {locales.map((l) => (
              <Button
                key={l}
                lang={l}
                variant={l === locale ? 'default' : 'outline'}
                aria-pressed={l === locale}
                onClick={() => pick(l)}
                data-testid={`locale-${l}`}
              >
                {names[l]}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <code>/i18n</code>, from a link or the menu, opens in the language picked here, or else
            the browser's.
          </p>
        </DemoCard>
        <DemoCard title="From the server" tag="flash(c, { message: m.said_hello({ name }) })">
          <form action={localizedHref('/i18n')} method="post" className="grid gap-4">
            <TextField label={m.name_label()} name="name" error={errors.name} testid="err-name" />
            <SubmitButton data-testid="say-hello">{m.say_hello()}</SubmitButton>
          </form>
        </DemoCard>
      </div>
    </>
  )
}
