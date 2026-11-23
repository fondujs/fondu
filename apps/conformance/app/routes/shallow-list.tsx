import { defineHandler, render } from 'fondu'
import { closeShallow, href, navigate, reload, usePage } from 'fondu/client'
import { useState } from 'react'

export const loader = defineHandler((c) =>
  render(c, List, {
    items: ['7', '8'],
    label: 'list props',
  }),
)

export default function List({ items, label }: { items: string[]; label: string }) {
  const { component, url } = usePage()
  const id = new URL(url, 'http://localhost').pathname.split('/shallow-items/')[1]
  const [error, setError] = useState('')
  const attempt = (to: string) => {
    try {
      navigate(to, { shallow: true })
    } catch (error) {
      setError((error as Error).message)
    }
  }
  return (
    <>
      <h1 id="cross-list">List</h1>
      <output id="component">{component}</output>
      <output id="url">{url}</output>
      <output id="label">{label}</output>
      <div style={{ position: 'fixed', top: 0, left: 0, background: 'white', zIndex: 1 }}>
        <input id="draft" />
        {items.map((id) => (
          <a
            key={id}
            id={`open-${id}`}
            href={href('/shallow-items/:id', { id })}
            data-shallow
            data-transition
          >
            {id}
          </a>
        ))}
        <a id="target" href={href('/shallow-items/:id', { id: '7' })} data-shallow target="_blank">
          New tab
        </a>
        <a id="download" href={href('/shallow-items/:id', { id: '7' })} data-shallow download>
          Download
        </a>
        <a id="foreign" href="https://example.com/shallow-items/7" data-shallow>
          Another origin
        </a>
        <a id="not-page" href="/not-a-page" data-shallow>
          Not a page
        </a>
        <a id="http-route" href="/counted" data-shallow>
          HTTP route
        </a>
        <a id="leave" href={href('/shallow-items/:id', { id: '9' })}>
          Visit item
        </a>
        <a id="visit" href={href('/shallow-items/:id', { id: '7' })}>
          Visit this URL normally
        </a>
        <button
          id="api"
          onClick={() => navigate(href('/shallow-items/:id', { id: '7' }), { shallow: true })}
        >
          Open in code
        </button>
        <button
          id="replace"
          onClick={() =>
            navigate(href('/shallow-items/:id', { id: '8' }), { shallow: true, replace: true })
          }
        >
          Replace
        </button>
        <button id="invalid" onClick={() => attempt('/not-a-page')}>
          Invalid
        </button>
        <button id="outside" onClick={() => attempt('https://example.com/shallow-items/7')}>
          Outside
        </button>
        <button id="api-http" onClick={() => attempt('/counted')}>
          HTTP route
        </button>
        <button id="reload" onClick={() => reload()}>
          Reload props
        </button>
        <button id="close" onClick={() => closeShallow(href('/shallow-list'))}>
          Close
        </button>
        <output id="error">{error}</output>
        {id && items.includes(id) && <aside id="item-dialog">Dialog {id}</aside>}
      </div>
      <div style={{ height: 3000 }} />
    </>
  )
}
