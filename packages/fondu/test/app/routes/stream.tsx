import { defineHandler, render } from 'fondu'
import { Suspense, use } from 'react'

import { current } from './_stream/gate.js'

type Props = { mode: 'ok' | 'boundary' | 'shell' | 'long' }

export const loader = defineHandler((c) =>
  render(c, Stream, { mode: (c.req.query('mode') ?? 'ok') as Props['mode'] }, { status: 202 }),
)

// the server waits in the boundary (a promise made by the page, once per request); the browser has the data
export default function Stream({ mode }: Props) {
  if (mode === 'shell') throw new Error('the shell fails')
  const wait = typeof document === 'undefined' ? current() : undefined
  return (
    <>
      <title>Streamed</title>
      <h1>Shell</h1>
      {mode === 'long' && (
        <ul id="long">
          {Array.from({ length: 2000 }, (_, i) => (
            <li key={i}>{`item ${i}`}</li>
          ))}
        </ul>
      )}
      <Suspense fallback={<p id="fallback">Loading</p>}>
        <Later wait={wait} fail={mode === 'boundary'} />
      </Suspense>
    </>
  )
}

function Later({ wait, fail }: { wait?: Promise<void>; fail: boolean }) {
  if (wait) use(wait)
  if (fail && wait) throw new Error('the boundary fails')
  return <p id="late">Late content</p>
}
