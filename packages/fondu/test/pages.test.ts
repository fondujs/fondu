import { parseAst } from 'vite'
import { describe, expect, test } from 'vitest'

import { isPageFile, layoutsOf, pageId } from '../src/paths.js'
import { stripServerCode } from '../src/vite/strip.js'

describe('pages in routes/', () => {
  test('a page: a route file of React (.tsx, .jsx, .mdx); .ts is server code', () => {
    expect(isPageFile('users/[id].tsx')).toBe(true)
    expect(isPageFile('docs/intro.mdx')).toBe(true)
    expect(isPageFile('users/[id].ts')).toBe(false)
    expect(isPageFile('_layout.tsx')).toBe(false)
    expect(isPageFile('admin/_parts/badge.tsx')).toBe(false)
    expect(isPageFile('users/show.test.tsx')).toBe(false)
  })
  test('its id: its route file without the extension', () => {
    expect(pageId('(site)/users/[id].tsx')).toBe('(site)/users/[id]')
    expect(pageId('docs/intro.mdx')).toBe('docs/intro')
  })
  test('the directories whose _layout wraps a page, outermost first', () => {
    expect(layoutsOf('index')).toEqual([''])
    expect(layoutsOf('(site)/legal/terms')).toEqual(['', '(site)', '(site)/legal'])
  })
})

// the browser's copy of a page's route file: as the compiled JSX is, plain JavaScript
const strip = (code: string) =>
  stripServerCode(code, parseAst(code) as never, 'users/[id].tsx')
    .replace(/\n+/g, '\n')
    .trim()

describe("the browser's copy of a page's route file", () => {
  test('the server exports go, and what only they used', () => {
    const out = strip(`
import { defineHandler, render } from 'fondu'
import { getUser } from '#/lib/users.server.ts'
import { Card } from '#/components/card.tsx'
const select = (u) => ({ name: u.name })
export const loader = defineHandler(async (c) => render(c, Show, select(await getUser(c))))
export const action = defineHandler((c) => c.text('x'))
export const actions = { a: defineHandler((c) => c.text('a')) }
export const prerender = true
export default function Show({ user }) { return jsx(Card, { children: user.name }) }
`)
    expect(out).toBe(
      "import { Card } from '#/components/card.tsx'\nexport default function Show({ user }) { return jsx(Card, { children: user.name }) }",
    )
  })
  test('what the page uses stays, a shared declaration too; an import keeps the names still used', () => {
    const out = strip(`
import { a, b } from 'x'
import d, * as all from 'y'
const shared = a
export const loader = () => [shared, b]
export default function Page() { return [shared, all] }
`)
    expect(out).toBe(
      "import { a } from 'x';\nimport * as all from 'y';\nconst shared = a\nexport default function Page() { return [shared, all] }",
    )
  })
  test('a side effect stays (an import for it, a statement)', () => {
    const out = strip(`
import './page.css'
import { track } from 'z'
track('page')
export const loader = () => null
export default () => null
`)
    expect(out).toBe(
      "import './page.css'\nimport { track } from 'z'\ntrack('page')\nexport default () => null",
    )
  })
  test('export lists, and the lines of the rest where they were', () => {
    const code = `import { h } from 'h'\nconst loader = () => h\n\nexport { loader }\nexport default function P() {}\n`
    const out = stripServerCode(code, parseAst(code) as never, 'p.tsx')
    expect(out.split('\n')).toEqual(['', '', '', '', 'export default function P() {}', ''])
  })
  test("a name the page declares for itself is not the import's", () => {
    // as `const { flash } = usePage()` in a page, and `flash` imported (from 'fondu') for its action
    const out = strip(`
import { flash, a, b, c, d, e, f, g } from 'fondu'
export const action = () => [flash, a, b, c, d, e, f, g]
export default function Page({ a = b }) {
  const { flash } = usePage()
  for (const c of []) c
  try {} catch (d) { d }
  { let e; e }
  function f() {}
  g: { break g }
  return [flash, a, f, x.g, { g: 1 }]
}
`)
    expect(out.split('\n')[0]).toBe("import { b } from 'fondu';")
  })
  test("a name a nested scope does not declare is the import's", () => {
    const out = strip(`
import { a, b } from 'x'
export const loader = () => [a, b]
export default function Page() {
  { let a }
  return () => [a, function b() {}]
}
`)
    expect(out.split('\n')[0]).toBe("import { a } from 'x';")
  })
  test('code that names a server export: an error (it would reach the browser)', () => {
    expect(() =>
      strip(`export let loader\nloader = () => secret()\nexport default () => null`),
    ).toThrow('loader is server code')
    expect(() => strip(`export const loader = () => 1\nexport default () => loader`)).toThrow(
      'loader is server code',
    )
  })
  test('what it cannot tell apart: an error', () => {
    expect(() => strip(`export * from 'x'\nexport default () => null`)).toThrow('`export *`')
    expect(() => strip(`export const loader = 1, Page = 2\nexport default () => null`)).toThrow(
      'on a line of their own',
    )
  })
})
