import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseAst, type Plugin } from 'vite'
import { describe, expect, test } from 'vitest'

import { isPageFile, layoutsOf } from '../src/paths.js'
import { layouts } from '../src/vite/layouts.js'

describe('pages/ files', () => {
  test('a page: .tsx, .jsx or .mdx, its name not starting with _', () => {
    expect(isPageFile('docs/intro.mdx')).toBe(true)
    expect(isPageFile('users/show.tsx')).toBe(true)
    expect(isPageFile('docs/_layout.tsx')).toBe(false)
    expect(isPageFile('docs/_parts.tsx')).toBe(false)
    expect(isPageFile('styles.css')).toBe(false)
  })
  test('nor a directory on its path (#91)', () => {
    expect(isPageFile('admin/_parts/badge.tsx')).toBe(false)
    expect(isPageFile('_drafts/docs/intro.mdx')).toBe(false)
    expect(isPageFile('admin/_parts/deep/dialog.tsx')).toBe(false)
    // an underscore elsewhere in a name is a page's
    expect(isPageFile('sign_up/step_2.tsx')).toBe(true)
  })
  test('nor a test next to a page, as in routes/', () => {
    expect(isPageFile('users/show.test.tsx')).toBe(false)
    expect(isPageFile('users/show.spec.jsx')).toBe(false)
    expect(isPageFile('users/test.tsx')).toBe(true)
    expect(isPageFile('users/contest.tsx')).toBe(true)
  })
  test('the directories whose _layout wraps a page, outermost first', () => {
    expect(layoutsOf('index.tsx')).toEqual([''])
    expect(layoutsOf('marketing/legal/terms.tsx')).toEqual(['', 'marketing', 'marketing/legal'])
  })
})

describe('the layout chain on page modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'fondu-layouts-'))
  for (const dir of ['app/pages/docs/guide', 'app/pages/admin'])
    mkdirSync(join(root, dir), { recursive: true })
  for (const file of ['app/pages/_layout.tsx', 'app/pages/docs/_layout.tsx'])
    writeFileSync(join(root, file), 'export default () => null')
  const plugin = layouts() as Plugin & {
    configResolved: (c: { root: string }) => void
    transform: (
      this: { parse: typeof parseAst; error: (message: string) => never },
      code: string,
      id: string,
    ) => { code: string } | undefined
  }
  plugin.configResolved({ root })
  // Rollup's plugin context, as much as the plugin uses: error() throws
  const context = {
    parse: parseAst,
    error: (message: string): never => {
      throw new Error(message)
    },
  }
  const transform = (file: string, code: string) =>
    plugin.transform.call(context, code, join(root, 'app/pages', file))?.code

  test('a named component: its chain, unless the page set its own', () => {
    const out = transform(
      'docs/guide/forms.tsx',
      'export default function Forms() { return null }',
    )!
    expect(out).toContain(
      `import __fondu_layout_0 from ${JSON.stringify(join(root, 'app/pages/_layout.tsx'))}`,
    )
    expect(out).toContain(
      `import __fondu_layout_1 from ${JSON.stringify(join(root, 'app/pages/docs/_layout.tsx'))}`,
    )
    expect(out).toContain('Forms.layout ??= [__fondu_layout_0, __fondu_layout_1];')
  })
  test('an anonymous component or an expression: named first', () => {
    const out = transform('admin/users.tsx', 'const a = "naïve ›"\nexport default memo(() => a);')!
    expect(out).toContain('const __fondu_page = memo(() => a);\nexport default __fondu_page;')
    expect(out).toContain('__fondu_page.layout ??= [__fondu_layout_0];')
  })
  test('export { X as default }', () => {
    expect(transform('index.tsx', 'function Home() {}\nexport { Home as default }')).toContain(
      'Home.layout ??=',
    )
  })
  test('a layout, or a page with none above it: left as it is', () => {
    expect(transform('docs/_layout.tsx', 'export default function L() {}')).toBeUndefined()
    const bare = layouts() as typeof plugin
    const empty = mkdtempSync(join(tmpdir(), 'fondu-layouts-'))
    bare.configResolved({ root: empty })
    const page = join(empty, 'app/pages/users.tsx')
    expect(bare.transform.call(context, 'export default function Users() {}', page)).toBeUndefined()
  })
  test('a page with no default export: an error, layouts above it or not (#91)', () => {
    expect(() => transform('admin/badge.tsx', 'export function Badge() { return null }')).toThrow(
      'fondu: app/pages/admin/badge.tsx has no default export',
    )
    const bare = layouts() as typeof plugin
    const empty = mkdtempSync(join(tmpdir(), 'fondu-layouts-'))
    bare.configResolved({ root: empty })
    expect(() =>
      bare.transform.call(context, 'export const x = 1', join(empty, 'app/pages/x.tsx')),
    ).toThrow('fondu: app/pages/x.tsx has no default export')
  })
  test('a file under a _ directory, or a test: not a page, left as it is (#91)', () => {
    expect(transform('admin/_parts/badge.tsx', 'export function Badge() {}')).toBeUndefined()
    expect(transform('admin/users.test.tsx', "import { test } from 'vitest'")).toBeUndefined()
  })
  test('a re-exported component: wrapped in a component of the page, which gets the chain (#91)', () => {
    const out = transform('docs/guide/new.tsx', "export { default } from './edit.tsx'")!
    expect(out).not.toContain('export { default }')
    expect(out).toContain("import { default as __fondu_shared } from './edit.tsx';")
    expect(out).toContain('const __fondu_page = (props) => __fondu_h(__fondu_shared, props);')
    expect(out).toContain('export default __fondu_page;')
    expect(out).toContain('__fondu_page.layout ??= [__fondu_layout_0, __fondu_layout_1];')
    // a named component, and the module's other re-exports kept
    const named = transform(
      'admin/new.tsx',
      "export { Edit as default, schema } from '../docs/edit.tsx'",
    )!
    expect(named).toContain("export { schema } from '../docs/edit.tsx';")
    expect(named).toContain("import { Edit as __fondu_shared } from '../docs/edit.tsx';")
    expect(named).toContain('__fondu_page.layout ??= [__fondu_layout_0];')
    // with no layout above it: wrapped, with no layout of its own, so the app's default applies and not the one its
    // other page set on the component
    const bare = layouts() as typeof plugin
    const empty = mkdtempSync(join(tmpdir(), 'fondu-layouts-'))
    bare.configResolved({ root: empty })
    const page = join(empty, 'app/pages/new.tsx')
    const wrapped = bare.transform.call(context, "export { default } from './edit.tsx'", page)!.code
    expect(wrapped).toContain('export default __fondu_page;')
    expect(wrapped).not.toContain('.layout')
    // a page of its own with no layout above it: as it is
    expect(bare.transform.call(context, 'export default function New() {}', page)).toBeUndefined()
  })
  test('export * as default: a default export, left as it is', () => {
    expect(transform('admin/all.tsx', "export * as default from './parts.ts'")).toBeUndefined()
  })
})
