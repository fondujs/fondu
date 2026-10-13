import { createApp } from 'fondu'
import { NONCE } from 'hono/secure-headers'

// The site's Worker. Its pages are static files (routes/_middleware.ts), served without it; it answers the rest (a
// 404). The theme is set before the first paint by /theme.js, as a static page cannot read the cookie. The search
// (Pagefind) runs WebAssembly.
const app = createApp({
  document: ({ head, body }) =>
    `<!doctype html><html lang="en" class="system"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="/theme.js"></script><link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">${head}</head><body>${body}</body></html>`,
  secureHeaders: { contentSecurityPolicy: { scriptSrc: ["'self'", NONCE, "'wasm-unsafe-eval'"] } },
})

export default app
