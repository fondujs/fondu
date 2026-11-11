// The server render of fondu/client's app: the page in its directories' layouts, the tags it renders hoisted out of #app
import { createElement as h, useId, type ReactNode } from 'react'
import { renderToReadableStream, renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'

import { __entry, Deferred, renderPage, usePage } from '../src/client.js'
import { pageAt } from '../src/client/app.js'

const Outer = ({ children }: { children: ReactNode }) => h('section', { id: 'outer' }, children)
const Inner = ({ children }: { children: ReactNode }) => h('div', { id: 'inner' }, children)
const Show = ({ name }: { name: string }) => [
  h('title', { key: 't' }, `User ${name}`),
  h('h1', { key: 'h' }, name, ' at ', usePage().url),
]
const Labeled = () => {
  const id = useId()
  return h('label', { htmlFor: id }, id)
}
const Plain = () => h('p', null, 'plain')
const Board = () =>
  h(
    Deferred,
    { data: ['a', 'b'], fallback: h('i', null, 'wait'), failed: h('b', null, 'failed') },
    'done',
  )
const Inherited = () =>
  h(
    Deferred,
    { data: 'toString', fallback: h('i', null, 'wait'), failed: h('b', null, 'failed') },
    'done',
  )

// on the server, the entry only keeps the modules (no document to start the app in)
__entry(
  {
    '/app/routes/(site)/users/[id].tsx': async () => ({ default: Show }),
    '/app/routes/labeled.tsx': async () => ({ default: Labeled }),
    '/app/routes/about.mdx': async () => ({ default: Plain }),
    '/app/routes/admin/users/list.tsx': async () => ({ default: Plain }),
    '/app/routes/(site)/users/new.tsx': async () => ({ default: Plain }),
    '/app/routes/(site)/index.tsx': async () => ({ default: Plain }),
    '/app/routes/files/[...path].tsx': async () => ({ default: Plain }),
    '/app/routes/café.tsx': async () => ({ default: Plain }),
    '/app/routes/_error.tsx': async () => ({ default: Plain }),
    '/app/routes/board.tsx': async () => ({ default: Board }),
    '/app/routes/inherited.tsx': async () => ({ default: Inherited }),
  },
  {
    '/app/routes/(site)/_layout.tsx': async () => ({ default: Inner }),
    '/app/routes/admin/_layout.tsx': async () => ({ default: Outer }),
    '/app/routes/admin/users/_layout.tsx': async () => ({ default: Inner }),
  },
  { prerender: false, progress: false },
)

// the page's stream, read whole: the tags it hoists (before `<div id="app"`) and the page
const render = async (component: string, props = {}, deferred?: string[]) => {
  const stream = await renderPage({ ...page(component, props), deferred }, (el) =>
    renderToReadableStream(el),
  )
  const html = await new Response(stream).text()
  const at = html.indexOf('<div id="app"')
  return { head: html.slice(0, at), body: html.slice(at) }
}
const page = (component: string, props = {}) =>
  ({ component, props, url: '/users/7', version: null, flash: {} }) as const

test("a page in its directory's _layout.tsx (a group's too); the page's tags before #app", async () => {
  const { head, body } = await render('(site)/users/[id]', { name: 'Ada' })
  expect(head).toBe('<title>User Ada</title>')
  expect(body).toBe(
    '<div id="app"><div id="inner"><h1>Ada<!-- --> at <!-- -->/users/7</h1></div></div>',
  )
})

test('the _layout.tsx of each directory, outermost first', async () => {
  const { body } = await render('admin/users/list')
  expect(body).toBe(
    '<div id="app"><section id="outer"><div id="inner"><p>plain</p></div></section></div>',
  )
})

test('a page with no _layout.tsx above it: as it is', async () => {
  const { head, body } = await render('about')
  expect([head, body]).toEqual(['', '<div id="app"><p>plain</p></div>'])
})

test('Deferred: the fallback while a prop is pending, failed when it is neither there nor pending, the children once all are there', async () => {
  const body = async (props: object, deferred?: string[]) =>
    (await render('board', props, deferred)).body
  expect(await body({}, ['a', 'b'])).toBe('<div id="app"><i>wait</i></div>')
  expect(await body({ a: 1 }, ['b'])).toBe('<div id="app"><i>wait</i></div>')
  expect(await body({ a: 1 })).toBe('<div id="app"><b>failed</b></div>')
  expect(await body({ a: 1, b: null })).toBe('<div id="app">done</div>')
})

test('Deferred: a prop is what the props own, not what objects inherit', async () => {
  const body = async (deferred: string[]) => (await render('inherited', {}, deferred)).body
  expect(await body(['toString'])).toBe('<div id="app"><i>wait</i></div>')
  expect(await body([])).toBe('<div id="app"><b>failed</b></div>')
})

test('a page that is not there: said so', async () => {
  await expect(render('nope')).rejects.toThrow('there is no page "nope"')
})

test("a URL's page, guessed to load its modules with its data: static segments first", () => {
  expect(pageAt('/')).toBe('(site)/index')
  expect(pageAt('/users/7')).toBe('(site)/users/[id]')
  expect(pageAt('/users/new')).toBe('(site)/users/new')
  expect(pageAt('/about')).toBe('about')
  expect(pageAt('/files/a/b')).toBe('files/[...path]')
  expect(pageAt('/files')).toBeUndefined()
  expect(pageAt('/nope/nope')).toBeUndefined()
  // none of the pages: a file, a route without a page, a URL of nothing (their links are the browser's)
  expect(pageAt('/llms.txt')).toBeUndefined()
  expect(pageAt('/api/health')).toBeUndefined()
  expect(pageAt('/users/7/edit')).toBeUndefined()
  // a segment as the browser writes it, encoded: the page the server matches; one that doesn't decode is none
  expect(pageAt('/caf%C3%A9')).toBe('café')
  expect(pageAt('/café')).toBe('café')
  expect(pageAt('/%E0%A4%A')).toBeUndefined()
})

test("useId(): the server's tree is the browser's (#app and the page, nothing beside it)", async () => {
  // the browser hydrates `<App/>` into #app: its tree is the page's component alone (App has one child at each
  // level, so it adds nothing to a useId()'s position). A sibling of #app on the server is a fork: every id differs
  const { body } = await render('labeled')
  const id = (html: string) => /for="([^"]+)"/.exec(html)![1]
  expect(id(body)).toBe(id(renderToString(h(Labeled))))
})
