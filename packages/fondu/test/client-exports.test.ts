import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import * as client from '../src/client.js'
import * as app from '../src/client/app.js'
import * as internal from '../src/client/internal.js'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

// the rows of the `fondu/client` table of the API page: the name of each export
function documented(): string[] {
  const section = /^## `fondu\/client`\n([\s\S]*?)(?=^## )/m.exec(
    read('../../../apps/site/app/routes/docs/api.mdx'),
  )![1]!
  return [...new Set([...section.matchAll(/^\| `<?(\w+)/gm)].map((m) => m[1]!))]
}

// `Errors` is a type: it has no value to list
const TYPES = ['Errors']

test("fondu/client's exports are the documented ones", () => {
  expect(Object.keys(client).sort()).toEqual(
    documented()
      .filter((n) => !TYPES.includes(n))
      .sort(),
  )
  expect(documented()).toContain('request')
  expect(documented()).toContain('RequestError')
})

test('the internals are in fondu/client/internal, not in fondu/client', () => {
  expect(Object.keys(internal).sort()).toEqual(['__entry', 'renderPage'])
  expect(client).not.toHaveProperty('__entry')
  expect(client).not.toHaveProperty('renderPage')
  expect(client).not.toHaveProperty('fetch')
  expect(client).not.toHaveProperty('FetchError')
})

// one module behind both entries: one React context, one navigation state
test('both entries re-export the one module of the client', () => {
  expect(internal.__entry).toBe(app.__entry)
  expect(internal.renderPage).toBe(app.renderPage)
  expect(client.usePage).toBe(app.usePage)
  expect(client.Deferred).toBe(app.Deferred)
})

test("package.json's exports: fondu/client/internal is declared", () => {
  const exports = JSON.parse(read('../package.json')).exports
  expect(exports['./client/internal']).toEqual({
    types: './dist/client/internal.d.ts',
    import: './dist/client/internal.js',
  })
})

test("fondu/vite's public entry has only the plugin (HONO, entryCode and productionAssets are internal modules, for tests)", async () => {
  const vite = await import('../src/vite/index.js')
  expect(Object.keys(vite)).toEqual(['default'])
})
