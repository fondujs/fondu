import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseAst, type Plugin } from 'vite'
import { describe, expect, test } from 'vitest'

import { isPageFile, layoutsOf } from '../src/paths.js'
import { pages } from '../src/vite/pages.js'

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

describe('page modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'fondu-pages-'))
  const plugin = pages() as Plugin & {
    configResolved: (c: { root: string }) => void
    transform: (
      this: { parse: typeof parseAst; error: (message: string) => never },
      code: string,
      id: string,
    ) => void
  }
  plugin.configResolved({ root })
  // Rollup's plugin context, as much as the plugin uses: error() throws
  const context = {
    parse: parseAst,
    error: (message: string): never => {
      throw new Error(message)
    },
  }
  const check = (file: string, code: string) =>
    plugin.transform.call(context, code, join(root, 'app/pages', file))

  test('a default export, in any form: a page', () => {
    expect(() => check('a.tsx', 'export default function A() { return null }')).not.toThrow()
    expect(() => check('b.tsx', 'const b = () => null\nexport { b as default }')).not.toThrow()
    expect(() => check('c.tsx', "export { default } from './a.tsx'")).not.toThrow()
    expect(() => check('d.tsx', "export * as default from './parts.ts'")).not.toThrow()
  })
  test('none: an error (#91)', () => {
    expect(() => check('admin/badge.tsx', 'export function Badge() { return null }')).toThrow(
      'fondu: app/pages/admin/badge.tsx has no default export',
    )
  })
  test('a layout, a file under a _ directory, a test: not pages, not checked (#91)', () => {
    expect(() => check('docs/_layout.tsx', 'export const x = 1')).not.toThrow()
    expect(() => check('admin/_parts/badge.tsx', 'export function Badge() {}')).not.toThrow()
    expect(() => check('admin/users.test.tsx', "import { test } from 'vitest'")).not.toThrow()
  })
})
