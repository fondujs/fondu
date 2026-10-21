import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { vitestCache } from '../src/vite/vitest-cache.js'

type Generate = (c: { id: string }) => string | false | undefined

// the generator the plugin gives Vitest, for an app at `root`
function generatorFor(root: string, hook = 'defineCacheKeyGenerator') {
  const plugin = vitestCache('app/app.tsx')
  ;(plugin.configResolved as (c: { root: string }) => void)({ root })
  let generate: Generate = () => 'none'
  plugin.configureVitest({ [hook]: (g: Generate) => (generate = g) })
  return generate
}

describe("Vitest's file cache", () => {
  const root = mkdtempSync(join(tmpdir(), 'fondu-vitest-cache-'))
  mkdirSync(join(root, 'app/pages/admin'), { recursive: true })
  const generate = generatorFor(root)

  test("a page's key has its layout chain: a _layout.tsx added above it is a new key", () => {
    const page = { id: join(root, 'app/pages/admin/users.tsx') }
    const before = generate(page)
    writeFileSync(join(root, 'app/pages/admin/_layout.tsx'), 'export default () => null')
    expect(generate(page)).not.toBe(before)
    expect(generate({ id: `${page.id}?v=1` })).toBe(generate(page))
  })
  test('the entry is not cached: its transform lists the pages', () => {
    expect(generate({ id: join(root, 'app/app.tsx') })).toBe(false)
    expect(generate({ id: `${join(root, 'app/app.tsx')}?v=1` })).toBe(false)
  })
  test("anything else: Vitest's key", () => {
    expect(generate({ id: join(root, 'app/pages/admin/_layout.tsx') })).toBeUndefined()
    expect(generate({ id: join(root, 'app/components/badge.tsx') })).toBeUndefined()
    expect(generate({ id: join(root, 'app/routes/index.ts') })).toBeUndefined()
  })
  test("Vitest 4's name for the hook", () => {
    expect(
      generatorFor(root, 'experimental_defineCacheKeyGenerator')({ id: join(root, 'app/app.tsx') }),
    ).toBe(false)
  })
})
