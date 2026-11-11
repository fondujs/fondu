import { Suspense, use } from 'react'

// no `prerender`: streamed. The server waits in the boundary; the browser has the data
export default function Slow() {
  const wait =
    typeof document === 'undefined' ? new Promise<void>((r) => setTimeout(r, 2000)) : undefined
  return (
    <>
      <title>Slow</title>
      <h1>Slow</h1>
      <Suspense fallback={<p id="fallback">Loading</p>}>
        <Later wait={wait} />
      </Suspense>
    </>
  )
}

function Later({ wait }: { wait?: Promise<void> }) {
  if (wait) use(wait)
  return (
    <>
      <meta name="late" content="1" />
      <p id="late">Late content</p>
      <a id="to-long" href="/long">
        Long
      </a>
    </>
  )
}
