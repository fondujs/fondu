import { usePage } from 'fondu/client'

// prerendered: its file is made without a query, and a direct load at `?x=1` still has the query in `usePage().url`
// (e2e/shallow.spec.ts)
export const prerender = true

export default function ShallowStatic() {
  const { url } = usePage()
  return (
    <>
      <title>Static</title>
      <h1>Static</h1>
      <output id="url">{url}</output>
      <a id="open" href="?tab=a" data-shallow>
        Tab a
      </a>
    </>
  )
}
