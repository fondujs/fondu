import geistMono from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'
import instrumentSerif from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url'
import allo from 'allo-font/fonts/webfonts/AlloVariableFriendly.woff2?url'
import type { DocumentParts } from 'fondu'
import dates from 'virtual:doc-dates'

import { jsonLd, structuredData } from '#/structured-data.ts'

// Fondu gives a document's scripts the nonce, and static pages their hashes.
const THEME =
  "document.documentElement.className=/(?:^|; )theme=(light|dark)/.exec(document.cookie)?.[1]??'system'"

export default function Document({ head, body, c }: DocumentParts) {
  const data = structuredData(c.req.path, dates)
  return (
    <html lang="en" className="system">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* preloaded: the text is laid out once in them, not in a fallback first (a layout shift) */}
        <link rel="preload" href={allo} as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href={geistMono} as="font" type="font/woff2" crossOrigin="" />
        {/* in the home page's document only: a page's own <link> would be added again on a navigation to it */}
        {c.req.path === '/' && (
          <link rel="preload" href={instrumentSerif} as="font" type="font/woff2" crossOrigin="" />
        )}
        {/* a data block: Fondu gives it no nonce and no hash */}
        {data && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
        )}
        {head}
      </head>
      <body>{body}</body>
    </html>
  )
}
