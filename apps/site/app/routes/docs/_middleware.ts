import { defineMiddleware, share } from 'fondu'

import { tocOf } from '#/lib/toc.server.ts'

export default defineMiddleware(async (c, next) => {
  share(c, { toc: () => tocOf(c.req.path.replace(/^\/docs\/?/, '')) })
  await next()
})
