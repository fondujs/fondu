# Rendering

Docs: [server-side rendering](https://fondu.dev/docs/ssr.md), [static pages](https://fondu.dev/docs/static-pages.md),
[the document](https://fondu.dev/docs/document.md).

## Streaming and Suspense

A document request is rendered on the server, then React hydrates it; navigations after that are rendered in the
browser. The document is streamed: its first bytes are the start of the document, the page's `<head>` tags, the page
data and its shell (everything outside a `<Suspense>` boundary). A boundary whose data isn't there yet shows its
fallback and is sent when it resolves.

- The status, headers, redirects and cookies are sent with the first byte: the loader decides them.
- Tags a boundary renders (`<title>`, `<meta>`) land in `<body>`; the first `<title>` of the document wins. Without
  JavaScript the fallback stays.
- A component that suspends outside any boundary holds the whole page: wrap what is slow in `<Suspense>`.
- A page's own data that comes with a second request is a [deferred prop](data.md).
- If a page throws while rendering on the server, Fondu logs it and sends the page to render in the browser. Fix it all
  the same. A boundary that throws after the shell is sent renders in the browser, and the status stays.
- A component that needs the browser (`window`, a chart library) renders after an effect, or with
  `useSyncExternalStore` and a server snapshot of `null`. Pages must not touch `window` or `document` while rendering.

## No server render

```ts
// vite.config.ts: no server render is built for the app
fondu({ target: 'node', ssr: false })
```

For some routes: `withoutSsr()` as a middleware, in a directory's `_middleware.ts` (`export default withoutSsr()`), or in a
handler: `defineHandler(withoutSsr(), (c) => render(c, Dashboard))`. Such a page is empty until its JavaScript runs.

## Static pages

```ts
// vite.config.ts
fondu({ target: 'node', prerender: true }) // or 'bun', 'cloudflare'
```

A route opts in with `export const prerender`; a `_middleware.ts` sets it for its directory and below, and the nearest
setting wins:

```ts
// app/routes/(marketing)/_middleware.ts: every page below
export const prerender = true

// app/routes/(marketing)/contact.tsx: not this one
export const prerender = false

// app/routes/blog/[slug].tsx: a dynamic route lists its pages' params
export const prerender = () => posts.map((post) => ({ slug: post.slug }))
```

- Each page is written as a document (`docs/intro.html`) and as its page object (`_fondu/pages/docs/intro.json`) that
  navigations read. On Cloudflare, Workers Static Assets serve them; on Bun and Node, the built server does.
- A static page is the same for everyone: rendered once, for a visitor with no cookies and no query, shared props
  included, every Suspense boundary resolved, deferred props evaluated.
- The build stops, naming the route, when a page answers with a status other than 200 (a redirect), takes POSTs (an
  `action` or `actions`), or has a URL ending in `index` (`routes/blog/index.tsx` at `/blog` is fine).
- On Cloudflare, the Worker the build runs reads `.dev.vars`: keep what static pages show out of it.
- The other pages are still answered by the server.

## The document

The HTML around pages (`<html>`, `<head>`, `<body>`). The default is minimal; `createApp({ document })` replaces it
with a function of `DocumentParts` (`fondu`), returning JSX or a string:

```tsx
// app/document.tsx
import type { DocumentParts } from 'fondu'

export default function Document({ head, body, c }: DocumentParts) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {head}
      </head>
      <body>{body}</body>
    </html>
  )
}
```

```ts
// app/server.ts
import { createApp } from 'fondu'

import Document from '#/document.tsx'

export default createApp({ document: Document })
```

- `head`: the page's scripts, then its tags. Put it last in `<head>`.
- `body`: the page data and the rendered page. Put it alone in `<body>`: what follows it is sent last.
- `c`: the request's Hono context (a cookie, a header). `nonce`: the request's CSP nonce, for a string document.
- The document is for what every page shares: `<html>` attributes, charset, viewport, icons, fonts. A page renders its
  own `<title>` and `<meta>`.

## Scripts, fonts and the nonce

- The Content Security Policy runs scripts of the site's own files, or with the request's nonce. A JSX document's
  inline scripts get the nonce from Fondu, as do React's own streaming scripts. Never put what a request brings in a
  script or in `dangerouslySetInnerHTML`.
- A string document is not escaped and its scripts get no nonce: write it, `<script nonce="${nonce}">`.
- On a static page there is no nonce: the scripts that had it are allowed by their hashes.
- A script from another origin needs that origin in `scriptSrc`. Fonts served by the app (Fontsource) need nothing;
  Google Fonts needs `styleSrc` and `fontSrc` (see [server.md](server.md) for how a directive is replaced).
