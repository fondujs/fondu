import { defineHandler, render } from 'fondu'
import { usePage } from 'fondu/client'

// no `prerender`: a redirect that drops the query, `/trim?x=1` to `/trim`, and one to a prerendered page. A real
// redirect: the client follows it, and the address is the target's (e2e/static-query.spec.ts)
export const loader = defineHandler(async (c) => {
  const search = new URL(c.req.url).searchParams
  return search.has('x')
    ? c.redirect('/trim', 302)
    : search.has('to')
      ? c.redirect('/static-query', 302)
      : render(c, Trim, {})
})

export default function Trim() {
  const { url } = usePage()
  return (
    <>
      <title>Trim</title>
      <h1>Trim</h1>
      <output id="url">{url}</output>
    </>
  )
}
