import { defineHandler, flash, render } from 'fondu'
import { usePage } from 'fondu/client'

// What the server received, shown by the page it redirects to (an action answers with a redirect):
// the method, the body's type, the body as it came (multipart: its fields, a file by its name and size)
export const action = defineHandler(async (c) => {
  const type = (c.req.header('content-type') ?? '').split(';')[0]!
  let body: string
  if (type === 'multipart/form-data') {
    const fields = [...(await c.req.formData()).entries()].map(([k, v]) =>
      typeof v === 'string' ? [k, v] : [k, `${v.name} (${v.size})`],
    )
    body = JSON.stringify(fields)
  } else body = await c.req.text()
  flash(c, { received: JSON.stringify({ method: 'POST', type, body }) })
  return c.redirect('/echo', 303)
})

export const loader = defineHandler((c) => render(c, Echo, { query: new URL(c.req.url).search }))

export default function Echo({ query }: { query: string }) {
  const { flash } = usePage()
  const received = (flash as { received?: string }).received
  return (
    <>
      <title>Echo</title>
      <pre id="received">{received ?? JSON.stringify({ method: 'GET', query })}</pre>
    </>
  )
}
