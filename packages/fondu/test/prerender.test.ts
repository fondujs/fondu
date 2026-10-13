import { createApp } from 'fondu'
// fondu({ prerender: true }): the files, the paths, the page objects of the pages without a file.
import { describe, expect, test } from 'vitest'

import { pageDataPath, pathOfPageData } from '../src/paths.js'
import { prerenderPaths, type PrerenderRoute } from '../src/server/prerender.js'
import { headerRules, staticFiles, staticPolicy } from '../src/vite/prerender.js'

const route = (file: string, pattern: string, settings: PrerenderRoute['settings'], more = {}): PrerenderRoute => ({
  file,
  pattern,
  settings,
  get: true,
  others: [],
  ...more,
})

describe('files', () => {
  test('a page and its page object', () => {
    expect(staticFiles('/')).toEqual({ html: 'index.html', json: '_fondu/pages/index.json' })
    expect(staticFiles('/docs/intro')).toEqual({ html: 'docs/intro.html', json: '_fondu/pages/docs/intro.json' })
    expect(staticFiles('/docs/')).toEqual({ html: 'docs/index.html', json: '_fondu/pages/docs/index.json' })
    expect(staticFiles('/docs/caf%C3%A9')).toEqual({ html: 'docs/café.html', json: '_fondu/pages/docs/café.json' })
  })
  test('the page object URL, both ways', () => {
    for (const path of ['/', '/docs/intro', '/docs/', '/a%20b']) expect(pathOfPageData(pageDataPath(path))).toBe(path)
    expect(pathOfPageData('/docs/intro.json')).toBe(null)
  })
})

describe('headers', () => {
  test('a static document has no nonce; script-src keeps a source', () => {
    expect(staticPolicy("default-src 'self'; script-src 'self' 'nonce-abc'; object-src 'none'")).toBe(
      "default-src 'self'; script-src 'self'; object-src 'none'",
    )
    expect(staticPolicy("script-src 'nonce-abc'")).toBe("script-src 'self'")
  })
  test('one rule for the documents, X-Inertia for the page objects', () => {
    expect(headerRules({ 'referrer-policy': 'same-origin' })).toBe(
      '\n/*\n  referrer-policy: same-origin\n/_fondu/pages/*\n  X-Inertia: true\n',
    )
  })
})

describe('paths', () => {
  test('the nearest setting wins: the route, then its directories', async () => {
    const { paths, problems } = await prerenderPaths([
      route('index.ts', '/', [undefined, true]),
      route('about.ts', '/about', [false, true]),
      route('blog/[slug].ts', '/blog/:slug', [() => [{ slug: 'a' }, { slug: 'b c' }], undefined]),
      route('admin/index.ts', '/admin', [undefined, false, true]),
      route('api.ts', '/api', [undefined, true], { get: false, others: ['POST'] }), // no page: not prerendered
    ])
    expect(paths).toEqual(['/', '/blog/a', '/blog/b%20c'])
    expect(problems).toEqual([])
  })
  test('what cannot be prerendered fails the build, naming the route', async () => {
    const { paths, problems } = await prerenderPaths([
      route('pricing.ts', '/pricing', [undefined, true], { others: ['POST'] }),
      route('blog/[slug].ts', '/blog/:slug', [undefined, true]),
      route('docs/[...path].ts', '/docs/:path{.+}', [() => [{ path: '../x' }]]),
    ])
    expect(paths).toEqual([])
    expect(problems).toHaveLength(3)
    expect(problems[0]).toMatch(/^routes\/pricing\.ts takes POST/)
    expect(problems[1]).toMatch(/^routes\/blog\/\[slug\]\.ts is dynamic/)
    expect(problems[2]).toMatch(/^routes\/docs\/\[\.\.\.path\]\.ts: fondu: param "path" is not a path segment/)
  })
})

describe('the app', () => {
  const app = createApp()
  test('the paths, only while the build prerenders', async () => {
    expect((await app.request('/__fondu/prerender')).status).toBe(404)
    const res = await app.request('/__fondu/prerender', {}, { FONDU_PRERENDER: '1' })
    expect(await res.json()).toEqual({ version: 'v1', paths: ['/', '/users/1', '/users/2'], problems: [] })
  })
  test('the page object of a page without a file: the page, as a visit', async () => {
    const res = await app.request('/_fondu/pages/index.json?fresh', {
      headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'v1' },
    })
    expect(res.headers.get('x-inertia')).toBe('true')
    const page = (await res.json()) as { component: string; url: string }
    expect(page.component).toBe('home')
    expect(page.url).toBe('/?fresh')
  })
  test('… from other assets: reloaded at the page, not at the page object', async () => {
    const res = await app.request('/_fondu/pages/index.json', {
      headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'old' },
    })
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-location')).toBe('http://localhost/')
  })
})
