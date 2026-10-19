import type { DocumentParts } from 'fondu'

import { themeOf } from '#/lib/theme.server.ts'
import { getLocale } from '#/paraglide/runtime.js'

const DESCRIPTION = 'Every Fondu feature, running live, with the code that makes it work.'

/**
 * The HTML around every page (server.ts): the page's language, the theme a visitor chose at the first paint, and what
 * link previews show (public/og.png, from .github/assets/og-demo.svg)
 */
export default function Document({ head, body, c }: DocumentParts) {
  return (
    <html lang={getLocale()} className={themeOf(c)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="description" content={DESCRIPTION} />
        <meta property="og:site_name" content="Fondu demo" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:image" content="https://demo.fondu.dev/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={`Fondu demo · ${DESCRIPTION}`} />
        <meta name="twitter:card" content="summary_large_image" />
        {head}
      </head>
      <body>{body}</body>
    </html>
  )
}
