import { back, defer, defineHandler, flash, render, ValidationError } from 'fondu'
import { closeShallow, navigate, reload, useNavigation, usePage } from 'fondu/client'
import { useState, useSyncExternalStore } from 'react'

// A drawer the URL holds (`?item=b`) over a list, and tabs in a #fragment (e2e/shallow.spec.ts). A click on an item is
// a shallow navigation: no request, the item is in the list already. A document load at the URL has the server render
// the drawer, and Back and closeShallow() close it.
const items = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
]
type Item = (typeof items)[number]
let loads = 0

export const actions = {
  // a flash message, back to the page it came from
  note: defineHandler((c) => {
    flash(c, { message: 'Saved' })
    return back(c)
  }),
  // errors, back to the page it came from
  check: defineHandler(() => {
    throw new ValidationError({ name: 'Too short' })
  }),
}

export const loader = defineHandler((c) => {
  const search = new URL(c.req.url).search
  // `item` is what the document at this URL needs; `loads` says which answer of the loader the page is, `later` for
  // which query it was asked
  return render(c, Shallow, {
    items,
    item: items.find((item) => item.id === new URLSearchParams(search).get('item')) ?? null,
    loads: ++loads,
    later: defer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      return search || 'none'
    }),
  })
})

const subscribe = (notify: () => void) => {
  addEventListener('hashchange', notify)
  return () => removeEventListener('hashchange', notify)
}

export default function Shallow({
  items,
  item: loaded,
  loads,
  later,
}: {
  items: Item[]
  item: Item | null
  loads: number
  later?: string
}) {
  const { url, flash, props } = usePage()
  const { state } = useNavigation()
  const [refused, setRefused] = useState('')
  // the #fragment of the address bar: a shallow navigation fires `hashchange` for it
  const hash = useSyncExternalStore(
    subscribe,
    () => location.hash,
    () => '',
  )
  // from the URL, not the props: a shallow navigation changes the URL, and the props stay the loader's answer
  const id = new URL(url, 'http://x').searchParams.get('item')
  const item = id === null ? null : (items.find((item) => item.id === id) ?? loaded)
  const following = item
    ? item.id === 'c'
      ? 'a'
      : String.fromCharCode(item.id.charCodeAt(0) + 1)
    : ''
  const attempt = (run: () => void) => {
    try {
      run()
    } catch (error) {
      setRefused((error as Error).message)
    }
  }
  return (
    <>
      <title>Shallow</title>
      <h1>Shallow</h1>
      <output id="loads">{loads}</output>
      <output id="url">{url}</output>
      <output id="nav">{state}</output>
      <output id="later">{later ?? 'pending'}</output>
      <output id="loaded">{loaded?.id ?? ''}</output>
      <output id="flash">{(flash as { message?: string }).message ?? ''}</output>
      <output id="errors">{props.errors.name ?? ''}</output>
      {/* fixed: a click never scrolls the page (the tests keep a scroll position) */}
      <div
        id="controls"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '60%',
          maxHeight: '100vh',
          overflow: 'auto',
          background: 'white',
          zIndex: 1,
        }}
      >
        {items.map((item) => (
          <a key={item.id} id={`open-${item.id}`} href={`?item=${item.id}`} data-shallow>
            {item.name}
          </a>
        ))}
        <input id="draft" defaultValue="" />
        <a id="open-abs" href="/shallow?item=b" data-shallow>
          Beta, with its path
        </a>
        <a id="open-plain" href="?item=a">
          Alpha, a plain link
        </a>
        <a id="to-long" href="/long">
          Long
        </a>
        <a id="shallow-to-long" href="/long?x=1" data-shallow>
          Long, marked shallow
        </a>
        <a id="slash" href="/shallow/?item=a" data-shallow>
          With a slash
        </a>
        <a id="to-slow" href="/slow">
          Slow
        </a>
        <button id="elsewhere" onClick={() => attempt(() => navigate('/long', { shallow: true }))}>
          Elsewhere
        </button>
        <button
          id="with-slash"
          onClick={() => attempt(() => navigate('/shallow/?item=a', { shallow: true }))}
        >
          With a slash
        </button>
        <button
          id="with-keep"
          onClick={() => attempt(() => navigate('?item=a', { shallow: true, keep: true } as never))}
        >
          Keep
        </button>
        <output id="refused">{refused}</output>
        <output id="hash">{hash}</output>
        <a id="tab-x" href="#tab/x" data-shallow>
          Tab x
        </a>
        <a id="tab-y" href="#tab/y" data-shallow>
          Tab y
        </a>
        <a id="native" href="#list">
          Native
        </a>
        <button id="push-x" onClick={() => navigate('#tab/x', { shallow: true })}>
          navigate #tab/x
        </button>
        <button id="push-q" onClick={() => navigate('?q=1', { shallow: true })}>
          navigate ?q=1
        </button>
        <button id="push-list" onClick={() => navigate('#list', { shallow: true })}>
          navigate #list
        </button>
        <button id="close-tab" onClick={() => closeShallow(url)}>
          Close tab
        </button>
        <button id="reload" onClick={() => reload()}>
          reload()
        </button>
        <button id="reload-only" onClick={() => reload({ only: ['item'] })}>
          reload({'{'} only {'}'})
        </button>
        <form method="post" action="?note">
          <button id="note">Note</button>
        </form>
        <form method="post" action="?check">
          <input name="name" defaultValue="x" />
          <button id="check">Check</button>
        </form>
      </div>
      <div style={{ height: 800 }} />
      <ul id="list">
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <div style={{ height: 2000 }} />
      {item && (
        <aside id="drawer" style={{ position: 'fixed', top: 20, right: 20, zIndex: 1 }}>
          <output id="item">{item.name}</output>
          <a id="next-push" href={`?item=${following}`} data-shallow>
            Next, an entry
          </a>
          <button
            id="next"
            onClick={() => navigate(`?item=${following}`, { shallow: true, replace: true })}
          >
            Next
          </button>
          <button id="close" onClick={() => closeShallow('/shallow')}>
            Close
          </button>
        </aside>
      )}
    </>
  )
}
