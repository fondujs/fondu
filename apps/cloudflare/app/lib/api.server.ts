import { defineMiddleware } from 'fondu'

/** The JSON API's guard: guests get 401 JSON, not a redirect to a page */
export const requireApiUser = defineMiddleware(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Not signed in' }, 401)
  await next()
})
