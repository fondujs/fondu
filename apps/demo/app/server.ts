import { createApp } from 'fondu'

import { resetDemo } from '#/lib/demo.server.ts'
import { themeOf } from '#/lib/theme.server.ts'

// The app from app/routes/. Built in: CSRF, security headers with a Content Security Policy, trailing slashes, the
// error page (pages/error.tsx). The document is this app's own: the chosen theme is on <html>.
const app = createApp({
  document: ({ head, body, c }) =>
    `<!doctype html><html lang="en" class="${themeOf(c)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">${head}</head><body>${body}</body></html>`,
})

// The Worker: the app for requests; the cron of wrangler.jsonc resets the demo's data
export default {
  fetch: app.fetch,
  scheduled: (_controller, _env, ctx) => ctx.waitUntil(resetDemo()),
} satisfies ExportedHandler<CloudflareBindings>
