import { Hono } from 'hono'
import { expect, test } from 'vitest'

import { pageAt } from '../src/client/app.js'
import { __entry } from '../src/client/internal.js'
import { pageId } from '../src/paths.js'
import { routeTable, type RouteModule } from '../src/server/routes.js'

// The browser picks the page of a URL as the server does: the same order, over the same files
const files = [
  'index.tsx',
  'about.tsx',
  'users/[id].tsx',
  'users/new.tsx',
  'files/[...path].tsx',
  'alpha/[one]/[two].tsx',
  '[one]/fixed/leaf.tsx',
  '[[lang]]/docs.tsx',
  'blog/[slug].tsx',
  'blog/[...rest].tsx',
  '[a]/[b]/z.tsx',
  'x/[y]/[...z].tsx',
  '[...all].tsx',
]
const urls = [
  '/',
  '/about',
  '/users/7',
  '/users/new',
  '/users/7/edit',
  '/files',
  '/files/a/b',
  '/alpha/fixed/leaf',
  '/alpha/x/y',
  '/beta/fixed/leaf',
  '/docs',
  '/de/docs',
  '/blog/first',
  '/blog/a/b',
  '/p/q/z',
  '/alpha/q/z',
  '/x/1/2',
  '/x/1',
  '/nope/nope',
]

test('the client picks the page the server answers with', async () => {
  const modules: Record<string, RouteModule> = Object.fromEntries(
    files.map((f) => [f, { GET: () => null }]),
  )
  const server = new Hono()
  for (const route of routeTable(modules, false))
    server.get(route.pattern, (c) => c.text(route.file))
  __entry(
    Object.fromEntries(files.map((f) => [`/app/routes/${f}`, async () => ({})])),
    {},
    {
      prerender: false,
      progress: false as const,
      viewTransitions: false,
    },
  )
  for (const url of urls) {
    const res = await server.request(url)
    const file = res.status === 200 ? await res.text() : undefined
    expect(pageAt(url), url).toBe(file && pageId(file))
  }
  expect(pageAt('/alpha/fixed/leaf')).toBe('alpha/[one]/[two]')
})
