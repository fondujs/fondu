import { createApp } from 'fondu'
import { NONCE } from 'hono/secure-headers'

import Document from '#/document.tsx'

// Cloudflare Web Analytics, which the zone adds to every page: its script, and where it reports
const ANALYTICS = { script: 'https://static.cloudflareinsights.com', report: 'https://cloudflareinsights.com' }

// The site's Worker. Its pages are static files (routes/_middleware.ts), served without it; it answers the rest (a
// 404). The search (Pagefind) runs WebAssembly.
const app = createApp({
  document: Document,
  secureHeaders: {
    contentSecurityPolicy: {
      scriptSrc: ["'self'", NONCE, "'wasm-unsafe-eval'", ANALYTICS.script],
      connectSrc: ["'self'", ANALYTICS.report],
    },
  },
})

export default app
