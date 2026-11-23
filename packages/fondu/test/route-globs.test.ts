// import.meta.glob takes literals, so the globs spell isRouteFile's rule again: they must agree.
import { readFileSync } from 'node:fs'
import { matchesGlob } from 'node:path'

import { describe, expect, test } from 'vitest'

import { isRouteFile } from '../src/paths.js'

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

function patterns(file: string, marker: string): string[] {
  const text = source(file)
  const start = text.indexOf(marker)
  expect(start, `${marker} in ${file}`).toBeGreaterThan(-1)
  const body = text.slice(text.indexOf('[', start), text.indexOf(']', start) + 1)
  return [...body.matchAll(/'(!?\/app\/routes\/[^']*)'/g)].map((m) => m[1]!)
}

const matches = (globs: string[], file: string) => {
  const path = `/app/routes/${file}`
  const include = globs.filter((g) => !g.startsWith('!'))
  const exclude = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1))
  return include.some((g) => matchesGlob(path, g)) && !exclude.some((g) => matchesGlob(path, g))
}

const files = [
  'index.ts',
  'users/[id].tsx',
  'docs/intro.mdx',
  'a.test.ts',
  'a.test.tsx',
  'a.test.mdx',
  'a.spec.mdx',
  'a/b.spec.tsx',
  'latest.tsx',
  'x.d.ts',
  '_middleware.ts',
  '_layout.tsx',
  '_parts/badge.tsx',
  'a/_parts/b/c.ts',
  '_helper.tsx',
]

describe('the globs agree with isRouteFile', () => {
  test('the server: .ts, .tsx and .mdx are loaded', () => {
    const globs = patterns('server/app.ts', 'import.meta.glob(')
    for (const file of files)
      if (matches(globs, file) && /\.(?:tsx?|mdx)$/.test(file) && !/(?:^|\/)_[^/]*$/.test(file))
        expect(isRouteFile(file), file).toBe(true)
    for (const file of files) if (isRouteFile(file)) expect(matches(globs, file), file).toBe(true)
  })
  test('the browser: the pages are .tsx and .mdx', () => {
    const globs = patterns('vite/index.ts', 'const PAGES_GLOB')
    for (const file of files)
      expect(matches(globs, file), file).toBe(isRouteFile(file) && !file.endsWith('.ts'))
  })
  test("the browser: the layouts are the _layout.tsx of the directories, not of a _directory's", () => {
    const globs = patterns('vite/index.ts', 'const LAYOUTS_GLOB')
    const layouts = ['_layout.tsx', 'docs/_layout.tsx', '(site)/a/_layout.tsx']
    const others = ['_parts/_layout.tsx', 'a/_parts/b/_layout.tsx', 'docs/_layout.ts', 'docs/x.tsx']
    for (const file of layouts) expect(matches(globs, file), file).toBe(true)
    for (const file of [...others, ...files])
      expect(matches(globs, file), file).toBe(file === '_layout.tsx')
  })
  test('the tests of every extension are no route', () => {
    for (const file of ['a.test.mdx', 'a.spec.mdx', 'a.test.ts', 'a.spec.tsx'])
      expect(isRouteFile(file), file).toBe(false)
    expect(isRouteFile('latest.tsx')).toBe(true)
  })
})
