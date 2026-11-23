import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import * as server from '../src/index.js'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const read = (relative: string) => readFileSync(path(relative), 'utf8')
const pkg = JSON.parse(read('../package.json'))

function exportNames(file: string): string[] {
  const code = read(file)
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const names = new Set<string>()
  for (const [, name] of code.matchAll(
    /^export (?:declare )?(?:async )?(?:function|class|const|let|interface|type|enum) (\w+)/gm,
  ))
    names.add(name!)
  for (const [, list] of code.matchAll(/^export (?:type )?\{([^}]*)\}/gm))
    for (const item of list!.split(','))
      if (item.trim())
        names.add(
          item
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)
            .at(-1)!,
        )
  if (/^export default /m.test(code)) names.add('default')
  return [...names].sort()
}

function documented(heading: string): string[] {
  const text = read('../../../apps/site/app/routes/docs/api.mdx')
  const section = new RegExp(`^### ${heading}\\n([\\s\\S]*?)(?=^###? |$(?![\\s\\S]))`, 'm').exec(
    text,
  )![1]!
  return [...section.matchAll(/^\| `(\w+)/gm)].map((m) => m[1]!)
}

describe('the server entry', () => {
  test('its values are the ones api.mdx documents', () => {
    const documentedValues = ['createApp', ...documented('Handlers'), ...documented('Responses')]
    expect(Object.keys(server).sort()).toEqual([...new Set(documentedValues)].sort())
  })
})

describe('package.json', () => {
  test('exports its own package.json', () => {
    expect(pkg.exports['./package.json']).toBe('./package.json')
  })

  test("engines.node is Vite 8's range", () => {
    expect(pkg.engines.node).toBe('^20.19.0 || >=22.12.0')
  })
})

describe('dist/*.d.ts', () => {
  for (const [entry, source, declaration] of [
    ['fondu', '../src/index.ts', '../dist/index.d.ts'],
    ['fondu/client', '../src/client.ts', '../dist/client.d.ts'],
    ['fondu/client/internal', '../src/client/internal.ts', '../dist/client/internal.d.ts'],
    ['fondu/vite', '../src/vite/index.ts', '../dist/vite/index.d.ts'],
  ] as const)
    test(`${entry} exports the names of its source`, () => {
      expect(existsSync(path(declaration)), `${declaration} is missing: run bun run build`).toBe(
        true,
      )
      expect(exportNames(declaration)).toEqual(exportNames(source))
    })

  test('each entry of package.json exports points at a declaration that exists', () => {
    for (const [name, target] of Object.entries<{ types?: string }>(pkg.exports))
      if (target.types) expect(existsSync(path(`../${target.types}`)), name).toBe(true)
  })
})
