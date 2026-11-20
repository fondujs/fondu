import { defineMiddleware } from 'fondu'

export default defineMiddleware(async (c, next) =>
  c.req.header('Authorization') === 'Bearer fixture' ? next() : c.text('Forbidden', 403),
)
