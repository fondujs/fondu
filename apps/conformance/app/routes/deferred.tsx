import { defer, defineHandler, render } from 'fondu'
import { Deferred, reload, useNavigation } from 'fondu/client'
import { useEffect, useRef, useState } from 'react'

type Stats = { for: string; at: number }

// no `prerender`: a page with deferred props. `stats` takes half a second (for the URL's query, and when);
// `broken` always throws
export const loader = defineHandler((c) =>
  render(c, Page, {
    stats: defer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return { for: new URL(c.req.url).search, at: Date.now() }
    }),
    broken: defer((): string => {
      throw new Error('the query failed')
    }),
  }),
)

export default function Page({ stats }: { stats?: Stats; broken?: string }) {
  const { state } = useNavigation()
  const log = useRef<HTMLOutputElement>(null)
  const [typed, setTyped] = useState('')
  // every state useNavigation() has been in: a quiet request adds none
  // (written to the DOM: React renders the <output> empty and leaves it alone)
  useEffect(() => {
    const out = log.current
    if (out) out.textContent = [out.textContent, state].filter(Boolean).join(',')
  }, [state])
  return (
    <>
      <title>Deferred</title>
      <h1>Deferred</h1>
      <input id="typed" value={typed} onChange={(event) => setTyped(event.target.value)} />
      <output id="state" ref={log} />
      <Deferred
        data="stats"
        fallback={<p id="fallback">Loading</p>}
        failed={<p id="stats-failed">Failed</p>}
      >
        <p id="stats">
          Stats for <span id="stats-for">{stats?.for}</span> at{' '}
          <span id="stats-at">{stats?.at}</span>
        </p>
      </Deferred>
      <Deferred
        data="broken"
        fallback={<p id="broken-fallback">Loading</p>}
        failed={<p id="broken-failed">Failed</p>}
      >
        <p id="broken">never</p>
      </Deferred>
      <button id="only" onClick={() => reload({ only: ['stats'] })}>
        reload({'{'} only: ['stats'] {'}'})
      </button>
      <button id="reload" onClick={() => reload()}>
        reload()
      </button>
      <a id="to-long" href="/long">
        Long
      </a>
      <a id="to-same" href="/deferred?x=1">
        Same page, another URL
      </a>
    </>
  )
}
