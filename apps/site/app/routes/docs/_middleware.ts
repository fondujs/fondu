import { defineMiddleware, share } from 'fondu'

import { tocOf } from '#/lib/toc.server.ts'

// The docs pages' headings (/docs/<slug>: routes/docs/<slug>.mdx), a prop of each, for the docs layout's table of
// contents
export default defineMiddleware(async (c, next) => {
  share(c, { toc: () => tocOf(c.req.path.replace(/^\/docs\/?/, '')) })
  await next()
})
