import { defineHandler, render } from 'fondu'
import { HTTPException } from 'hono/http-exception'

// GET /errors/:kind — each one fails in its own way
export const loader = defineHandler((c) => {
  switch (c.req.param('kind')) {
    case 'loader':
      throw new Error('The loader failed: the database did not answer')
    case 'forbidden':
      throw new HTTPException(403)
    case 'missing':
      return render(c, 'reports/yearly' as never) // a page that was never written
    default:
      throw new HTTPException(404)
  }
})
