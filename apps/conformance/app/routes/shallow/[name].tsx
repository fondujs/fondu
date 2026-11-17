import { defineHandler, render } from 'fondu'
import { closeShallow, navigate, usePage } from 'fondu/client'
import { useState } from 'react'

// A parameterized pathname for shallow page matching (e2e/shallow.spec.ts): encoded, raw and with a trailing slash.
export const loader = defineHandler((c) => render(c, Named, { name: c.req.param('name') ?? '' }))
export const action = defineHandler((c) => c.redirect('/shallow/other', 303))

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
      <a id="slash" href={`${url.split('?')[0]}/?x=3`}>
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
      <form method="post" action={url.split('?')[0]}>
        <button id="redirect-other">Post to another pathname</button>
      </form>
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
