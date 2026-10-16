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
        {head}
      </head>
      <body>{body}</body>
    </html>
  )
}
