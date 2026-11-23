import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ResolvedConfig } from 'vite'
import { afterAll, describe, expect, test } from 'vitest'

import { productionAssets } from '../src/vite/assets.js'

const manifest = {
  'app/entry.ts': {
    file: 'assets/entry-E.js',
    isEntry: true,
    css: ['assets/entry-E.css'],
    imports: ['_shared.js'],
  },
  '_shared.js': { file: 'assets/shared-S.js', css: ['assets/shared-S.css'] },
  '_ui.js': { file: 'assets/ui-U.js' },
  '_ui-alias.js': { file: 'assets/ui-U.js' },
  // the layouts and the page import the same chunks: the lists of a page repeat them
  'app/routes/_layout.tsx': {
    file: 'assets/layout-L.js',
    css: ['assets/layout-L.css'],
    imports: ['_shared.js', '_ui.js'],
  },
  'app/routes/docs/_layout.tsx': {
    file: 'assets/docs-layout-D.js',
    imports: ['_shared.js', '_ui-alias.js'],
  },
  'app/routes/docs/intro.tsx': {
    file: 'assets/docs-intro-I.js',
    css: ['assets/docs-intro-I.css'],
    imports: ['_shared.js', '_ui.js'],
  },
}

const dirs: string[] = []
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

async function load() {
  const root = mkdtempSync(join(tmpdir(), 'fondu-assets-'))
  dirs.push(root)
  mkdirSync(join(root, 'dist/client/.vite'), { recursive: true })
  writeFileSync(join(root, 'dist/client/.vite/manifest.json'), JSON.stringify(manifest))
  const config = { root, base: '/', environments: {} } as unknown as ResolvedConfig
  const code = productionAssets(config, { target: 'node' })
  const module = (await import(`data:text/javascript,${encodeURIComponent(code)}`)) as {
    assetTags(component: string, nonce?: string): string
  }
  return { code, module }
}

describe('the route manifest', () => {
  test('a page lists each file once, and none of the entry’s', async () => {
    const { code } = await load()
    const byPage = JSON.parse(/^const byPage = (.*)$/m.exec(code)![1]!) as Record<
      string,
      { css: string[]; js: string[] }
    >
    expect(byPage['docs/intro']).toEqual({
      css: ['assets/layout-L.css', 'assets/docs-intro-I.css'],
      js: [
        'assets/layout-L.js',
        'assets/ui-U.js',
        'assets/docs-layout-D.js',
        'assets/docs-intro-I.js',
      ],
    })
    for (const { css, js } of Object.values(byPage)) {
      expect(new Set(css).size).toBe(css.length)
      expect(new Set(js).size).toBe(js.length)
      expect(css).not.toContain('assets/entry-E.css')
      expect(css).not.toContain('assets/shared-S.css')
      expect(js).not.toContain('assets/entry-E.js')
      expect(js).not.toContain('assets/shared-S.js')
    }
  })
  test('the tags of a page with layouts are the full lists’: the entry first, each file once', async () => {
    const { module } = await load()
    expect(module.assetTags('docs/intro')).toBe(
      [
        '<link rel="stylesheet" href="/assets/shared-S.css">',
        '<link rel="stylesheet" href="/assets/entry-E.css">',
        '<link rel="stylesheet" href="/assets/layout-L.css">',
        '<link rel="stylesheet" href="/assets/docs-intro-I.css">',
        '<link rel="modulepreload" href="/assets/shared-S.js">',
        '<link rel="modulepreload" href="/assets/layout-L.js">',
        '<link rel="modulepreload" href="/assets/ui-U.js">',
        '<link rel="modulepreload" href="/assets/docs-layout-D.js">',
        '<link rel="modulepreload" href="/assets/docs-intro-I.js">',
        '<script type="module" src="/assets/entry-E.js"></script>',
      ].join(''),
    )
  })
  test('a page absent from the manifest gets the entry tags with the script nonce', async () => {
    const { module } = await load()
    expect(module.assetTags('missing', 'test-nonce')).toBe(
      [
        '<link rel="stylesheet" href="/assets/shared-S.css">',
        '<link rel="stylesheet" href="/assets/entry-E.css">',
        '<link rel="modulepreload" href="/assets/shared-S.js" nonce="test-nonce">',
        '<script type="module" src="/assets/entry-E.js" nonce="test-nonce"></script>',
      ].join(''),
    )
  })
})
