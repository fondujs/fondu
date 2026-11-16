import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import * as client from '../src/client.js'
import * as app from '../src/client/app.js'
import * as internal from '../src/client/internal.js'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

// the rows of a section's tables of the API page: the name of each export. `types`: the rows under `### Types`
function documented(entry: string, types = false): string[] {
  const text = read('../../../apps/site/app/routes/docs/api.mdx')
  const section = new RegExp(`^## \`${entry}\`\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm').exec(
    text,
  )![1]!
  const [values, ...rest] = section.split(/^### Types\n/m)
  const rows = types ? rest.join('').split(/^### /m)[0]! : values!
  const found = [...rows.matchAll(/^\| `<?(\w+)/gm)].map((m) => m[1]!)
  return [...new Set(found)]
}

// the type exports of an entry, read from its source (`export type X`, `export interface X`, `export type { X }`,
// `type X` in an export list): TypeScript's own program API is not in TypeScript 7
function typeExports(file: string): string[] {
  const code = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const names = (list: string) =>
    list
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  const out = [...code.matchAll(/^export (?:type|interface) (\w+)/gm)].map((m) => m[1]!)
  for (const [, list] of code.matchAll(/^export type \{([^}]*)\}/gm))
    out.push(...names(list!).map((n) => n.split(/\s+as\s+/).at(-1)!))
  for (const [, list] of code.matchAll(/^export \{([^}]*)\}/gm))
    out.push(
      ...names(list!)
        .filter((n) => n.startsWith('type '))
        .map((n) =>
          n
            .slice(5)
            .split(/\s+as\s+/)
            .at(-1)!,
        ),
    )
  return [...new Set(out)].sort()
}

test("fondu/client's exports are the documented ones", () => {
  expect(Object.keys(client).sort()).toEqual(documented('fondu/client').sort())
  expect(documented('fondu/client')).toContain('request')
  expect(documented('fondu/client')).toContain('RequestError')
})

test('the type exports of each entry are the documented ones', () => {
  for (const [entry, file] of [
    ['fondu', '../src/index.ts'],
    ['fondu/client', '../src/client.ts'],
    ['fondu/vite', '../src/vite/index.ts'],
  ] as const)
    expect(typeExports(file), entry).toEqual(documented(entry, true).sort())
  // the plumbing is not exported (ApiPath, AnswerOf, RequestArgs: request()'s types; StandardSchemaV1: validate.ts's)
  for (const name of ['ApiPath', 'AnswerOf', 'RequestArgs', 'StandardSchemaV1'])
    for (const file of ['../src/index.ts', '../src/client.ts', '../src/vite/index.ts'])
      expect(typeExports(file)).not.toContain(name)
  // ProgressOptions is the plugin's option: fondu/vite's, not fondu/client's
  expect(typeExports('../src/client.ts')).not.toContain('ProgressOptions')
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
