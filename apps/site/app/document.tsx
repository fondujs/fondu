import geistMono from '@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url'
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import type { DocumentParts } from 'fondu'

/**
 * Sets the theme chosen in the theme menu (a cookie) on <html> before the page paints. Fondu gives the document's
 * scripts the nonce, and allows them on static pages by their hashes.
 */
const THEME =
  "document.documentElement.className=/(?:^|; )theme=(light|dark)/.exec(document.cookie)?.[1]??'system'"

/** The HTML around every page (server.ts) */
export default function Document({ head, body }: DocumentParts) {
  return (
    <html lang="en" className="system">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* the fonts of every page, fetched with the stylesheet rather than after it: the text is laid out once,
            in them, not in a fallback first (a layout shift on a slow network) */}
        <link rel="preload" href={inter} as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href={geistMono} as="font" type="font/woff2" crossOrigin="" />
        {head}
      </head>
      <body>{body}</body>
    </html>
  )
}
