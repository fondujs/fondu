import { parseAst } from 'vite'
import { describe, expect, test } from 'vitest'

import { isPageFile, layoutsOf, pageId } from '../src/paths.js'
import { stripServerCode } from '../src/vite/strip.js'

describe('pages in routes/', () => {
  test('a page: a route file of React (.tsx, .mdx); .ts is server code', () => {
    expect(isPageFile('users/[id].tsx')).toBe(true)
    expect(isPageFile('docs/intro.mdx')).toBe(true)
    expect(isPageFile('users/[id].ts')).toBe(false)
    expect(isPageFile('_layout.tsx')).toBe(false)
    expect(isPageFile('admin/_parts/badge.tsx')).toBe(false)
    expect(isPageFile('users/show.test.tsx')).toBe(false)
    expect(isPageFile('users/form.jsx')).toBe(false)
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
  test("the loader's helpers that call each other go, with what they import", () => {
    const out = strip(`
import { db } from '#/lib/db.ts'
function a(n) { return n ? b(n - 1) : db.query() }
function b(n) { return a(n) }
export const loader = () => a(2)
export default function Page() { return null }
`)
    expect(out.trim()).toBe('export default function Page() { return null }')
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
  test("a default parameter's expression sees the outer scope, not the body's", () => {
    const names = (head: string) => strip(head).split('\n')[0]
    // an import used in a default, and shadowed by a body declaration of the same name
    for (const body of ['const a = 1', 'let a = 1', 'var a = 1', 'function a() {}', 'class a {}'])
      expect(
        names(`
import { a } from 'x'
export const loader = () => 1
export default function Page(p = a) { ${body}; return p }
`),
      ).toBe("import { a } from 'x'")
    // an outer constant
    expect(
      strip(
        `const t = 'outer'\nexport const loader = () => t\nexport default (v = t) => { const t = 1; return v }`,
      ),
    ).toContain("const t = 'outer'")
    // a destructuring default, in an arrow, a method and a function expression
    for (const fn of [
      '({ x = t } = {}) => { var t; return x }',
      'function ({ x = t }) { let t; return x }',
      '([x = t]) => { const t = 1; return x }',
      '(x = () => t) => { const t = 1; return x }',
      '(x = function () { return t }) => { class t {} return x }',
    ])
      expect(strip(`const t = 1\nexport const loader = () => t\nexport default ${fn}`)).toContain(
        'const t = 1',
      )
  })
  test("a body declaration is still the body's, a parameter its own", () => {
    // the body's `t` is its own: the outer one is only the loader's, and goes
    expect(
      strip(
        `const t = 1\nexport const loader = () => t\nexport default (v) => { const t = 2; return [v, t] }`,
      ),
    ).toBe('export default (v) => { const t = 2; return [v, t] }')
    expect(
      strip(`const t = 1\nexport const loader = () => t\nexport default (t, v = t) => [t, v]`),
    ).toBe('export default (t, v = t) => [t, v]')
    // a later parameter sees an earlier one; a nested function's parameters and body are its own
    expect(
      strip(
        `const t = 1\nexport const loader = () => t\nexport default (a, b = a) => (c = a) => { var t; return c }`,
      ),
    ).toBe('export default (a, b = a) => (c = a) => { var t; return c }')
  })
  test('the stripped copy runs as the original does', async () => {
    const run = async (code: string, ...args: unknown[]) =>
      (
        (await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`)) as {
          default: (...a: unknown[]) => unknown
        }
      ).default(...args)
    for (const code of [
      `const token = 'outer'\nexport const loader = () => token\nexport default function Page(value = token) { const token = 'inner'; return [value, token] }`,
      `const t = 'outer'\nexport const loader = () => t\nexport default ({ x = t } = {}) => { var t = 'inner'; return [x, t] }`,
      `const t = 'outer'\nexport const loader = () => t\nexport default function Page(v = () => t) { let t = 'inner'; return [v(), t] }`,
      `const t = 'outer'\nexport const loader = () => t\nexport default ([x = t]) => { function t() {} return [x, typeof t] }`,
    ]) {
      const stripped = strip(code)
      expect(await run(stripped, ...(code.includes('[x = t]') ? [[]] : []))).toEqual(
        await run(code, ...(code.includes('[x = t]') ? [[]] : [])),
      )
    }
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
