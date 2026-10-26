import { createApp } from 'fondu'

import Document from '#/document.tsx'
import { resetDemo } from '#/modules/demo/demo.server.ts'

// The app from app/routes/. Built in: CSRF, security headers with a Content Security Policy, trailing slashes, the
// error page (routes/_error.tsx). The document is this app's own (document.tsx): the chosen theme is on <html>.
const app = createApp({ document: Document })

// The Worker: the app for requests; the cron of wrangler.jsonc resets the demo's data
export default {
  fetch: app.fetch,
  scheduled: (_controller, _env, ctx) => ctx.waitUntil(resetDemo()),
} satisfies ExportedHandler<CloudflareBindings>
