import { describe, expect, test } from 'vitest'

import { reach } from '../src/vite/hmr.js'

// a server's module graph, as file → its importers
type Node = { file: string | null; importers: Set<Node> }
function graph(edges: Record<string, string[]>) {
  const nodes = new Map<string, Node>()
  const node = (file: string) => {
    if (!nodes.has(file)) nodes.set(file, { file, importers: new Set() })
    return nodes.get(file)!
  }
  for (const [file, importers] of Object.entries(edges))
    for (const i of importers) node(file).importers.add(node(i))
  return (file: string) => [node(file)]
}

const root = '/app-root'
const at = (rel: string) => `${root}/${rel}`
const modules = graph({
  // fondu (outside the app) imports the routes, the pages' entry, and is imported by server.ts and every route
  [at('app/routes/docs.ts')]: ['/fondu/dist/server/app.js'],
  ['/fondu/dist/server/app.js']: [at('app/server.ts')],
  ['/fondu/dist/index.js']: [at('app/server.ts'), at('app/routes/docs.ts')],
  [at('app/lib/db.server.ts')]: [at('app/routes/docs.ts')],
  [at('app/lib/toc.server.ts')]: [at('app/routes/docs.ts')],
  [at('app/pages/docs/intro.mdx')]: [at('app/app.tsx'), at('app/lib/toc.server.ts')],
  [at('app/pages/users.tsx')]: [at('app/app.tsx')],
  [at('app/app.tsx')]: ['/fondu/dist/server/document.js'],
  ['/fondu/dist/server/document.js']: ['/fondu/dist/index.js'],
  [at('app/lib/theme.server.ts')]: [at('app/server.ts')],
  [at('app/lib/shared.ts')]: [at('app/server.ts'), at('app/routes/docs.ts')],
})

describe('what a change reaches on the server', () => {
  test('a route, and what it imports: its props', () => {
    expect(reach(modules(at('app/routes/docs.ts')), root)).toEqual({
      routes: true,
      document: false,
    })
    expect(reach(modules(at('app/lib/db.server.ts')), root)).toEqual({
      routes: true,
      document: false,
    })
  })
  test('a page: the browser’s own update, unless a route reads it too (an MDX page’s toc)', () => {
    expect(reach(modules(at('app/pages/users.tsx')), root)).toEqual({
      routes: false,
      document: false,
    })
    expect(reach(modules(at('app/pages/docs/intro.mdx')), root)).toEqual({
      routes: true,
      document: false,
    })
  })
  test('server.ts, and what only it imports: the document', () => {
    expect(reach(modules(at('app/server.ts')), root)).toEqual({ routes: false, document: true })
    expect(reach(modules(at('app/lib/theme.server.ts')), root)).toEqual({
      routes: false,
      document: true,
    })
    expect(reach(modules(at('app/lib/shared.ts')), root)).toEqual({ routes: true, document: true })
  })
})
