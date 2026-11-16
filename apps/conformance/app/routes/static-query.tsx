import { reload, usePage } from 'fondu/client'

// prerendered: its file is made without a query. A navigation to `?tab=2#details` keeps both (e2e/static-query.spec.ts)
export const prerender = true

export default function StaticQuery() {
  const { url } = usePage()
  return (
    <>
      <title>Static query</title>
      <h1>Static query</h1>
      <output id="url">{url}</output>
      <button id="reload" onClick={() => reload()}>
        reload()
      </button>
      <a id="to-long" href="/long">
        Long
      </a>
      <div style={{ height: 2000 }} />
      <p id="details">Details</p>
      <div style={{ height: 1500 }} />
    </>
  )
}
