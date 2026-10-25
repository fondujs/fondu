// The server render of fondu/client's app: the page in its layouts, the tags it renders hoisted out of #app
import { createElement as h, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { expect, test } from 'vitest'

import { __entry, renderPage, startApp, usePage } from '../src/client.js'

const Outer = ({ children }: { children: ReactNode }) => h('section', { id: 'outer' }, children)
const Inner = ({ children }: { children: ReactNode }) => h('div', { id: 'inner' }, children)
const Show = ({ name }: { name: string }) => [
  h('title', { key: 't' }, `User ${name}`),
  h('h1', { key: 'h' }, name, ' at ', usePage().url),
]
const Plain = () => h('p', null, 'plain')
const Own = Object.assign(() => h('p', null, 'own'), { layout: Inner })
const Default = ({ children }: { children: ReactNode }) => h('main', null, children)

__entry(
  {
    '/app/pages/users/show.tsx': async () => ({ default: Show }),
    '/app/pages/users/own.tsx': async () => ({ default: Own }),
    '/app/pages/plain.mdx': async () => ({ default: Plain }),
    '/app/pages/admin/users/list.tsx': async () => ({ default: Plain }),
  },
  {
    '/app/pages/users/_layout.tsx': async () => ({ default: Inner }),
    '/app/pages/admin/_layout.tsx': async () => ({ default: Outer }),
    '/app/pages/admin/users/_layout.jsx': async () => ({ default: Inner }),
  },
  { prerender: false },
)
startApp({ layout: Default }) // on the server: only the options

const page = (component: string, props = {}) =>
  ({ component, props, url: '/users/7', version: null, flash: {} }) as const

test("a page in its directory's _layout.tsx; the page's tags before #app", async () => {
  const { head, body } = await renderPage(page('users/show', { name: 'Ada' }), renderToString)
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

test('a page that sets its own layout: that one', async () => {
  const { body } = await renderPage(page('users/own'), renderToString)
  expect(body).toBe('<div id="app"><div id="inner"><p>own</p></div></div>')
})

test("a page with no _layout.tsx above it: the app's", async () => {
  const { head, body } = await renderPage(page('plain'), renderToString)
  expect([head, body]).toEqual(['', '<div id="app"><main><p>plain</p></main></div>'])
})

test('a page that is not there: said so', async () => {
  await expect(renderPage(page('nope'), renderToString)).rejects.toThrow('there is no page "nope"')
})
