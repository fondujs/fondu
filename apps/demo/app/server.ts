import { createApp } from 'fondu'

import Document from '#/document.tsx'
import { resetDemo } from '#/modules/demo/demo.server.ts'

// img-src also lets the gallery (/transitions) show its photos from Unsplash.
const app = createApp({
  document: Document,
  secureHeaders: {
    contentSecurityPolicy: { imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'] },
  },
})

export default {
  fetch: app.fetch,
  scheduled: (_controller, _env, ctx) => ctx.waitUntil(resetDemo()),
} satisfies ExportedHandler<CloudflareBindings>
