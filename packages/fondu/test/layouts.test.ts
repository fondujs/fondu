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
      this: { parse: typeof parseAst },
      code: string,
      id: string,
    ) => { code: string } | undefined
  }
  plugin.configResolved({ root })
  const transform = (file: string, code: string) =>
    plugin.transform.call({ parse: parseAst }, code, join(root, 'app/pages', file))?.code

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
    expect(
      bare.transform.call({ parse: parseAst }, 'export default function Users() {}', page),
    ).toBeUndefined()
  })
})
