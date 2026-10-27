// The server render of fondu/client's app: the page in its directories' layouts, the tags it renders hoisted out of #app
import { createElement as h, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
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
    '/app/routes/_error.tsx': async () => ({ default: Plain }),
  },
  {
    '/app/routes/(site)/_layout.tsx': async () => ({ default: Inner }),
    '/app/routes/admin/_layout.tsx': async () => ({ default: Outer }),
    '/app/routes/admin/users/_layout.jsx': async () => ({ default: Inner }),
  },
  { prerender: false, progress: false },
)

const page = (component: string, props = {}) =>
  ({ component, props, url: '/users/7', version: null, flash: {} }) as const

test("a page in its directory's _layout.tsx (a group's too); the page's tags before #app", async () => {
  const { head, body } = await renderPage(
    page('(site)/users/[id]', { name: 'Ada' }),
    renderToString,
  )
  expect(head).toBe('<title>User Ada</title>')
  expect(body).toBe(
    '<div id="app"><div id="inner"><h1>Ada<!-- --> at <!-- -->/users/7</h1></div></div>',
  )
})

test('the _layout.tsx of each directory, outermost first', async () => {
  const { body } = await renderPage(page('admin/users/list'), renderToString)
  expect(body).toBe(
    '<div id="app"><section id="outer"><div id="inner"><p>plain</p></div></section></div>',
  )
})

test('a page with no _layout.tsx above it: as it is', async () => {
  const { head, body } = await renderPage(page('about'), renderToString)
  expect([head, body]).toEqual(['', '<div id="app"><p>plain</p></div>'])
})

test('a page that is not there: said so', async () => {
  await expect(renderPage(page('nope'), renderToString)).rejects.toThrow('there is no page "nope"')
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
})
