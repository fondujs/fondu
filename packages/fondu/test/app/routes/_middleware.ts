import { defineMiddleware, share } from 'fondu'

export default defineMiddleware(async (c, next) => {
  share(c, { app: 'test' })
  await next()
})
