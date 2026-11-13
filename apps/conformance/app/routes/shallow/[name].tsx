import { defineHandler, render } from 'fondu'
import { closeShallow, navigate, usePage } from 'fondu/client'
import { useState } from 'react'

// A page whose pathname is a param, for the shallow navigations that compare pathnames (e2e/shallow.spec.ts): an
// encoded one, and the same with a trailing slash
export const loader = defineHandler((c) => render(c, Named, { name: c.req.param('name') ?? '' }))

export default function Named({ name }: { name: string }) {
  const { url } = usePage()
  const [refused, setRefused] = useState('')
  return (
    <>
      <title>Named</title>
      <h1>Named</h1>
      <output id="name">{name}</output>
      <output id="url">{url}</output>
      <a id="same" href={`${url.split('?')[0]}?x=1`} data-shallow>
        Same page
      </a>
      <a id="raw" href="/shallow/café ☕?x=2" data-shallow>
        The same page, written raw
      </a>
      <a id="slash" href={`${url.split('?')[0]}/?x=3`} data-shallow>
        With a slash
      </a>
      <button
        id="slash-nav"
        onClick={() => {
          try {
            navigate(`${url.split('?')[0]}/?x=3`, { shallow: true })
          } catch (error) {
            setRefused((error as Error).message)
          }
        }}
      >
        With a slash
      </button>
      <button id="replace-other" onClick={() => navigate('/shallow/other', { replace: true })}>
        Replace with another
      </button>
      <button id="close" onClick={() => closeShallow(url.split('?')[0]!)}>
        Close
      </button>
      <output id="refused">{refused}</output>
    </>
  )
}
