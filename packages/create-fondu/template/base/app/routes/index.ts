import { defineHandler, render } from 'fondu'

// GET /: runs on the server, renders app/pages/index.tsx with these props
export const loader = defineHandler((c) =>
  render(c, 'index', { greeting: 'Hello from Hono', path: c.req.path }),
)
