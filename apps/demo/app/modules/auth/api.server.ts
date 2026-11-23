import { defineMiddleware } from 'fondu'

export const requireApiUser = defineMiddleware(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Not signed in' }, 401)
  await next()
})
