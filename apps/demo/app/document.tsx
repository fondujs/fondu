import type { DocumentParts } from 'fondu'

import { themeOf } from '#/lib/theme.server.ts'
import { getLocale } from '#/paraglide/runtime.js'

/** The HTML around every page (server.ts): the page's language, and the theme a visitor chose at the first paint */
export default function Document({ head, body, c }: DocumentParts) {
  return (
    <html lang={getLocale()} className={themeOf(c)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {head}
      </head>
      <body>{body}</body>
    </html>
  )
}
