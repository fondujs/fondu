import { defineMiddleware } from 'fondu'

// a directory that refuses before the handler: no `X-Auth` is a 401, `X-Auth: login` a redirect (the body limit
// runs after it, so a refused request's body is never read)
export default defineMiddleware((c, next) => {
  const auth = c.req.header('x-auth')
  if (auth === 'login') return c.redirect('/login', 303)
  return auth ? next() : c.text('Unauthorized', 401)
})
