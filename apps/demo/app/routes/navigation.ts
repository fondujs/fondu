import { defineHandler, render } from 'fondu'

// ?slow: answered a second later, to watch useNavigating()
export const loader = defineHandler(async (c) => {
  if (c.req.query('slow') !== undefined) await new Promise((r) => setTimeout(r, 1000))
  return render(c, 'navigation', { servedAt: new Date().toISOString().slice(11, 23) })
})
