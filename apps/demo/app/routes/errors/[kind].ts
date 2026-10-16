import { defineHandler, render } from 'fondu'
import { HTTPException } from 'hono/http-exception'

// what a proxy in front of the app sends when the app doesn't answer: a page of its own, not Inertia's
const proxyPage =
  '<!doctype html><title>502 Bad Gateway</title><h1>Bad gateway</h1><p>The app did not answer in time.</p>'

// GET /errors/:kind — each one fails in its own way
export const loader = defineHandler((c) => {
  switch (c.req.param('kind')) {
    case 'loader':
      throw new Error('The loader failed: the database did not answer')
    case 'forbidden':
      throw new HTTPException(403)
    case 'missing':
      return render(c, 'reports/yearly' as never) // a page that was never written
    case 'proxy':
      return c.html(proxyPage, 502)
    default:
      throw new HTTPException(404)
  }
})

// POST /errors/proxy — the proxy's page after a form
export const action = defineHandler((c) => {
  if (c.req.param('kind') !== 'proxy') throw new HTTPException(404)
  return c.html(proxyPage, 502)
})
