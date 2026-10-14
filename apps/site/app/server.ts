import { createApp } from 'fondu'
import { NONCE } from 'hono/secure-headers'

import { THEME_SCRIPT } from '#/theme.ts'

// Cloudflare Web Analytics, which the zone adds to every page: its script, and where it reports
const ANALYTICS = { script: 'https://static.cloudflareinsights.com', report: 'https://cloudflareinsights.com' }

// The site's Worker. Its pages are static files (routes/_middleware.ts), served without it; it answers the rest (a
// 404). The theme is set before the first paint by an inline script, allowed by its hash; the search (Pagefind)
// runs WebAssembly.
const app = createApp({
  document: ({ head, body }) =>
    `<!doctype html><html lang="en" class="system"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script>${THEME_SCRIPT}</script><link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">${head}</head><body>${body}</body></html>`,
  secureHeaders: {
    contentSecurityPolicy: {
      scriptSrc: ["'self'", NONCE, `'sha256-${__THEME_SCRIPT_HASH__}'`, "'wasm-unsafe-eval'", ANALYTICS.script],
      connectSrc: ["'self'", ANALYTICS.report],
    },
  },
})

export default app
