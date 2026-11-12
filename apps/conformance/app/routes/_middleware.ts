import { defineMiddleware, share } from 'fondu'

declare module 'fondu' {
  interface Register {
    shared: { who: string }
  }
}

// A shared prop the error page needs: a refusal (413) must still have it
export default defineMiddleware(async (c, next) => {
  share(c, { who: 'visitor' })
  await next()
})
