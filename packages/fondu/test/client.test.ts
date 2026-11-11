// The server render of fondu/client's app: the page in its directories' layouts, the tags it renders hoisted out of #app
import { createElement as h, type ReactNode } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import { expect, test } from 'vitest'

import { __entry, renderPage, usePage } from '../src/client.js'
import { pageAt } from '../src/client/app.js'

const Outer = ({ children }: { children: ReactNode }) => h('section', { id: 'outer' }, children)
const Inner = ({ children }: { children: ReactNode }) => h('div', { id: 'inner' }, children)
const Show = ({ name }: { name: string }) => [
  h('title', { key: 't' }, `User ${name}`),
  h('h1', { key: 'h' }, name, ' at ', usePage().url),
]
const Plain = () => h('p', null, 'plain')

// on the server, the entry only keeps the modules (no document to start the app in)
__entry(
  {
    '/app/routes/(site)/users/[id].tsx': async () => ({ default: Show }),
    '/app/routes/about.mdx': async () => ({ default: Plain }),
    '/app/routes/admin/users/list.tsx': async () => ({ default: Plain }),
    '/app/routes/(site)/users/new.tsx': async () => ({ default: Plain }),
    '/app/routes/(site)/index.tsx': async () => ({ default: Plain }),
    '/app/routes/files/[...path].tsx': async () => ({ default: Plain }),
    '/app/routes/café.tsx': async () => ({ default: Plain }),
    '/app/routes/_error.tsx': async () => ({ default: Plain }),
  },
  {
    '/app/routes/(site)/_layout.tsx': async () => ({ default: Inner }),
    '/app/routes/admin/_layout.tsx': async () => ({ default: Outer }),
    '/app/routes/admin/users/_layout.tsx': async () => ({ default: Inner }),
  },
  { prerender: false, progress: false },
)

// the page's stream, read whole: the tags it hoists (before `<div id="app"`) and the page
const render = async (component: string, props = {}) => {
  const stream = await renderPage(page(component, props), (el) => renderToReadableStream(el))
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
