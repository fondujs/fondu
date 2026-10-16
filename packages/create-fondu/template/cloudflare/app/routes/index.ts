import { env } from 'cloudflare:workers'
import { defineHandler, render } from 'fondu'

// GET /: runs on the server (the Worker), renders app/pages/index.tsx with these props; GREETING is
// a variable of wrangler.jsonc
export const loader = defineHandler((c) =>
  render(c, 'index', { greeting: env.GREETING, path: c.req.path }),
)
