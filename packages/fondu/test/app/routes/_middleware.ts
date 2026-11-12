import { defineMiddleware, share } from 'fondu'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'

const limit = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: () => {
      throw new HTTPException(413)
    },
  })
const upload = limit(1000)
const rest = limit(10 * 1024 * 1024)

export default [
  defineMiddleware(async (c, next) => {
    share(c, { app: 'test', lazy: async () => 'computed' } as never)
    await next()
  }),
  // the recipe of the forms docs (a limit chosen by path), for `createApp({ bodyLimit: false })`: /upload takes 1000
  // bytes, the rest 10 MB (what createApp has by default, so the other tests see no change)
  defineMiddleware((c, next) => (c.req.path === '/upload' ? upload : rest)(c, next)),
]
