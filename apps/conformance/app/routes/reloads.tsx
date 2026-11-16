import { defineHandler, render } from 'fondu'
import { reload } from 'fondu/client'

// no `prerender`: three props, asked for again quietly with `reload({ only })` (e2e/reloads.spec.ts, which holds each
// answer back and gives its own values)
export const loader = defineHandler((c) => {
  const query = new URL(c.req.url).search
  return render(c, Reloads, { a: `a0${query}`, b: `b0${query}`, c: `c0${query}` })
})

export default function Reloads({ a, b, c }: { a: string; b: string; c: string }) {
  return (
    <>
      <title>Reloads</title>
      <h1>Reloads</h1>
      <output id="a">{a}</output> <output id="b">{b}</output> <output id="c">{c}</output>
      <button id="only-a" onClick={() => reload({ only: ['a'] })}>
        a
      </button>
      <button id="only-ab" onClick={() => reload({ only: ['a', 'b'] })}>
        a, b
      </button>
      <button id="only-b" onClick={() => reload({ only: ['b'] })}>
        b
      </button>
      <button id="only-bc" onClick={() => reload({ only: ['b', 'c'] })}>
        b, c
      </button>
      <a id="to-same" href="/reloads?v=2">
        Same page, another URL
      </a>
    </>
  )
}
