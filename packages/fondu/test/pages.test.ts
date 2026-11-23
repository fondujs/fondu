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
    for (const body of ['const a = 1', 'let a = 1', 'var a = 1', 'function a() {}', 'class a {}'])
      expect(
        names(`
import { a } from 'x'
export const loader = () => 1
export default function Page(p = a) { ${body}; return p }
`),
      ).toBe("import { a } from 'x'")
    expect(
      strip(
        `const t = 'outer'\nexport const loader = () => t\nexport default (v = t) => { const t = 1; return v }`,
      ),
    ).toContain("const t = 'outer'")
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

const tsx = (code: string, file = 'users/[id].tsx') =>
  stripServerCode(code, parseAst(code, { lang: 'tsx' }) as never, file)
const lines = (code: string) =>
  tsx(code)
    .split('\n')
    .filter((l) => l.trim())

describe("the browser's copy of a page's route file, read as TSX", () => {
  test('the lines of the rest stay where they were', () => {
    const code = `import { db } from '#/db.server'\nexport async function loader(): Promise<number> {\n  return db.n\n}\n\nexport default function Page(): JSX.Element {\n  return <p>x</p>\n}\n`
    const out = tsx(code)
    expect(out.split('\n')).toHaveLength(code.split('\n').length)
    expect(out.split('\n')[5]).toBe('export default function Page(): JSX.Element {')
  })
  test('a JSX element name refers to what it names: <Card>, <ui.Badge>, <ui.a.B>', () => {
    const out = lines(`
import { Card } from '#/card'
import * as ui from '#/ui'
import { Gone } from '#/gone'
import { db } from '#/db.server'
export const loader = () => [db, Gone]
export default function Page() { return <Card><ui.a.Badge /><div /></Card> }
`)
    expect(out).toEqual([
      "import { Card } from '#/card'",
      "import * as ui from '#/ui'",
      'export default function Page() { return <Card><ui.a.Badge /><div /></Card> }',
    ])
  })
  test('a lowercase element is the browser’s own, an attribute’s name no reference; a closer scope wins', () => {
    const out = lines(`
import { div, Card, Item, label } from 'x'
export const loader = () => [div, Card, Item, label]
export default function Page({ Card }) {
  const Item = () => null
  return <div label="a"><Card /><Item /></div>
}
`)
    expect(out).toEqual([
      'export default function Page({ Card }) {',
      '  const Item = () => null',
      '  return <div label="a"><Card /><Item /></div>',
      '}',
    ])
  })
  test('a name in an attribute’s value, a spread or a child is a reference', () => {
    const out = lines(`
import { a, b, c, d } from 'x'
export const action = () => d
export default function Page() { return <p title={a} {...b}>{c}</p> }
`)
    expect(out[0]).toBe("import { a, b, c } from 'x';")
  })
  test('a type is no reference: `typeof loader` in a type, an `as`, a generic', () => {
    const out = lines(`
import { db, helper } from '#/db.server'
import { schema } from '#/schema'
type Data = Awaited<ReturnType<typeof loader>>
export type Props = { data: Data }
export interface Extra { db: typeof db }
export const loader = () => ({ rows: helper(db) })
export default function Page({ data }: Props) {
  const rows = data.rows as unknown as typeof helper
  return <p>{schema.parse(rows)}</p>
}
`)
    expect(out).toEqual([
      "import { schema } from '#/schema'",
      'type Data = Awaited<ReturnType<typeof loader>>',
      'export default function Page({ data }: Props) {',
      '  const rows = data.rows as unknown as typeof helper',
      '  return <p>{schema.parse(rows)}</p>',
      '}',
    ])
    expect(lines(`import { v } from 'x'\nexport default () => v as string`)[0]).toBe(
      "import { v } from 'x'",
    )
  })
  test('a type-only import or export goes: it would only load a server module as `import {} from`', () => {
    const out = lines(`
import type { Db } from '#/db.server'
import { type Row, util } from '#/rows.server'
import { type Only } from '#/only.server'
import { keep, type Kind } from '#/keep'
export type { Db }
export type { Row } from '#/rows.server'
export { type Kind, keep }
export { type Only } from '#/only.server'
export default function Page(p: { db: Db; row: Row }) { return <p>{keep(p)}</p> }
`)
    expect(out).toEqual([
      "import { keep } from '#/keep';",
      'export { keep };',
      'export default function Page(p: { db: Db; row: Row }) { return <p>{keep(p)}</p> }',
    ])
    expect(out.join('\n')).not.toContain('.server')
    expect(lines(`import { Db } from '#/db.server'\nexport default (p: Db) => null`)).toEqual([
      'export default (p: Db) => null',
    ])
  })
  test.each([
    ['an enum', 'enum Status { Ok }'],
    ['an enum', 'export const enum Color { Red }'],
    ['an enum', 'export const loader = () => { enum Secret { A } }'],
    ['a namespace', 'namespace A.B { export const x = 1 }'],
    ['a namespace', 'module M { export const x = 1 }'],
    ['`import x = …`', "import { A } from 'x'\nimport q = A.B"],
    ['`import x = …`', "import r = require('x')"],
    ['a class with a parameter property', 'class C { constructor(private a = 1) {} }'],
    ['a class with a decorator', '@d class C {}'],
    ['a class with a decorator', 'class C { @d m() {} }'],
    ['a class with a decorator', 'class C { m(@d a: number) {} }'],
  ])('%s: an error that names the file and says to move it', (what, code) => {
    expect(() => tsx(`${code}\nexport default () => null`)).toThrow(
      `fondu: routes/users/[id].tsx: ${what} is not allowed in a route file: move it to another module`,
    )
  })
  test('what has no code stays: ambient declarations, type-only imports', () => {
    const code = `declare enum E { A }
declare namespace N { const x: number }
declare global { interface Window { a: 1 } }
declare module 'x' { export const a: number }
declare class D { constructor(private a: number) }
import type q = require('y')
export default () => null`
    expect(tsx(code)).toBe(code)
  })
  test('the server exports of a TypeScript file go as they do of a JavaScript one', () => {
    const out = lines(`
import { defineHandler } from 'fondu'
export const loader = defineHandler<{ a: 1 }>(async (c) => c.json({} satisfies object))
export const actions = { a: defineHandler((c) => c.text('a')) } as const
export function action(c: Context): Response
export function action(c: Context) { return c.text('x') }
export default function Page() { return null }
`)
    expect(out).toEqual(['export default function Page() { return null }'])
  })
  test('code that names a server export (a value, not a type): an error', () => {
    expect(() =>
      tsx(`export const loader = () => 1\nexport default () => <p>{loader()}</p>`),
    ).toThrow('loader is server code')
  })
})
