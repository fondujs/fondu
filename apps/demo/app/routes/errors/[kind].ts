import { defineHandler, render } from 'fondu'
import { HTTPException } from 'hono/http-exception'

// what a proxy in front of the app sends when the app doesn't answer: a page of its own, not the app's (so its
// styles are its own too, here in the demo's colors)
const proxyPage = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>502 Bad Gateway</title>
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1rem;
    background: light-dark(#fff, #0f0f0f); color: light-dark(#262626, #f5f5f5); }
  main { max-width: 26rem; width: 100%; padding: 1.5rem; border-radius: 0.875rem;
    border: 1px solid light-dark(rgb(0 0 0 / 8%), rgb(255 255 255 / 6%)); background: light-dark(#fff, #141414); }
  .status { font: 0.75rem ui-monospace, monospace; color: light-dark(#5e5e5e, #8a8a8a); }
  h1 { margin: 0.25rem 0 0.5rem; font-size: 1.25rem; font-weight: 600; }
  p { margin: 0 0 1rem; color: light-dark(#5e5e5e, #a3a3a3); line-height: 1.5; }
  a { color: light-dark(oklch(55% 0.13 70), oklch(80% 0.16 85)); text-underline-offset: 3px; }
</style>
<main>
  <div class="status">502</div>
  <h1>Bad gateway</h1>
  <p>The app did not answer in time.</p>
  <a href="/errors">Back to Errors</a>
</main>
</html>`

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
