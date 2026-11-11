import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from 'fondu'
import { Hono } from 'hono'
// fondu({ prerender: true }): the files, the paths, the page objects of the pages without a file.
import { describe, expect, test } from 'vitest'

import { htmlFile, pageDataPath, pathOfPageData, staticFiles } from '../src/paths.js'
import { prerenderPaths, type PrerenderRoute } from '../src/server/prerender.js'
import { staticPages, type ServeStatic } from '../src/server/static.js'
import { ownScripts, prerender, staticPolicy, withHeaderRules } from '../src/vite/prerender.js'
import { calls } from './app/routes/_deferred/calls.js'

const route = (
  file: string,
  pattern: string,
  settings: PrerenderRoute['settings'],
  more = {},
): PrerenderRoute => ({
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
    expect(staticFiles('/docs/intro')).toEqual({
      html: 'docs/intro.html',
      json: '_fondu/pages/docs/intro.json',
    })
    expect(staticFiles('/docs/')).toEqual({
      html: 'docs/index.html',
      json: '_fondu/pages/docs/index.json',
    })
    // a param's value named index: a page of its own, not its directory's
    expect(staticFiles('/items/index').json).toBe('_fondu/pages/items/~index.json')
    expect(staticFiles('/docs/caf%C3%A9')).toEqual({
      html: 'docs/café.html',
      json: '_fondu/pages/docs/café.json',
    })
  })
  test('a document file from a decoded path (what a server reads), as the build writes it', () => {
    expect(htmlFile('/')).toBe('index.html')
    expect(htmlFile('/docs/intro')).toBe('docs/intro.html')
    expect(htmlFile('/docs/')).toBe('docs/index.html')
    expect(htmlFile('/docs/café')).toBe('docs/café.html')
    // not decoded again: `%2e%2e` here is a name, not `..`
    expect(htmlFile('/%2e%2e/secret')).toBe('%2e%2e/secret.html')
  })
  test('the page object URL, both ways', () => {
    // one for one, slash or not (trailingSlash: 'append' has both: a catch-all takes none), index or not
    for (const path of [
      '/',
      '/docs/intro',
      '/docs/',
      '/docs/a',
      '/docs/a/b/',
      '/items/index',
      '/items/index/',
      '/index',
      '/items/~index',
      '/items/~~index/',
      '/a%20b',
    ])
      expect(pathOfPageData(pageDataPath(path)), path).toBe(path)
    // index written encoded is index all the same (the server reads the path decoded)
    expect(pageDataPath('/items/%69ndex')).toBe('/_fondu/pages/items/~index.json')
    expect(pageDataPath('/items/%7Eindex')).toBe('/_fondu/pages/items/~~index.json')
    expect(pageDataPath('/items/%7einDEX')).toBe('/_fondu/pages/items/%7einDEX.json')
    expect(pathOfPageData('/_fondu/pages/items/~~index.json')).toBe('/items/~index')
    expect(pathOfPageData('/docs/intro.json')).toBe(null)
  })
})

describe('headers', () => {
  test('a static document has no nonce; script-src keeps a source', () => {
    expect(
      staticPolicy("default-src 'self'; script-src 'self' 'nonce-abc'; object-src 'none'"),
    ).toBe("default-src 'self'; script-src 'self'; object-src 'none'")
    expect(staticPolicy("script-src 'nonce-abc'")).toBe("script-src 'self'")
  })
  test('the scripts that had the nonce: allowed by their hashes instead', () => {
    const html =
      '<head><script nonce="abc">a()</script><script nonce="abc" type="module" src="/x.js"></script><script>b()</script></head>'
    const { hashes } = ownScripts(html, "script-src 'self' 'nonce-abc'")
    expect(hashes).toEqual([`'sha256-${createHash('sha256').update('a()').digest('base64')}'`])
    expect(staticPolicy("script-src 'self' 'nonce-abc'; style-src 'self'", hashes)).toBe(
      `script-src 'self' ${hashes[0]}; style-src 'self'`,
    )
    expect(staticPolicy("script-src 'self' 'unsafe-inline'", hashes)).toBe(
      "script-src 'self' 'unsafe-inline'",
    )
  })
  test("only the build's nonce is the document's: another one is dropped, its script not hashed", () => {
    const html =
      '<script nonce="abc">a()</script><div><script nonce="guess">evil()</script><link nonce="x" href="/y"></div>'
    const own = ownScripts(html, "script-src 'self' 'nonce-abc'")
    expect(own.html).toBe(
      '<script nonce="abc">a()</script><div><script>evil()</script><link href="/y"></div>',
    )
    expect(own.hashes).toEqual([`'sha256-${createHash('sha256').update('a()').digest('base64')}'`])
    expect(ownScripts(html, "script-src 'self'")).toEqual({ html, hashes: [] }) // no nonce: nothing is replaced
  })
  test('the reporting headers are security headers too (kept with the document)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fondu-headers-'))
    try {
      await prerender(
        serverOf({ '/x': pageOf('/x', { 'reporting-endpoints': 'main="/r"', 'report-to': '{}' }) }),
        dir,
        logger,
        { serverDir: dir },
      )
      const { headers } = JSON.parse(readFileSync(join(dir, 'prerender.json'), 'utf8')) as {
        headers: Record<string, string>
      }
      expect(headers['reporting-endpoints']).toBe('main="/r"')
      expect(headers['report-to']).toBe('{}')
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
  test("_headers: a rule for the documents, X-Fondu for the page objects, after Fondu's own", () => {
    const fondus = '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n'
    expect(withHeaderRules(fondus, { 'referrer-policy': 'same-origin' })).toBe(
      `${fondus}\n/*\n  referrer-policy: same-origin\n\n/_fondu/pages/*\n  X-Fondu: true\n`,
    )
  })
  test("_headers: the app's rule for a path gets the headers it doesn't set, its own kept (#99)", () => {
    const app =
      '/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  ! X-Frame-Options\n\n/api/*\n  X-Robots-Tag: noindex\n'
    const out = withHeaderRules(app, {
      'referrer-policy': 'same-origin',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
    })
    expect(out).toBe(
      '/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  ! X-Frame-Options\n  x-content-type-options: nosniff\n\n/api/*\n  X-Robots-Tag: noindex\n\n/_fondu/pages/*\n  X-Fondu: true\n',
    )
    expect(out.match(/^\/\*$/gm)).toHaveLength(1)
    // built again on the result: nothing more
    expect(withHeaderRules(out, { 'x-content-type-options': 'nosniff' })).toBe(out)
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
    expect(problems[2]).toMatch(
      /^routes\/docs\/\[\.\.\.path\]\.ts: fondu: param "path" is not a path segment/,
    )
  })
  test("a URL ending in index: a problem, its file would be its directory's page", async () => {
    const { paths, problems } = await prerenderPaths([
      route('index.ts', '/', [true]),
      route('[slug].ts', '/:slug', [() => [{ slug: 'about' }, { slug: 'index' }]]),
      route('index/index.ts', '/index', [true]),
    ])
    expect(paths).toEqual(['/', '/about'])
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/^routes\/\[slug\]\.ts: \/index ends in index/)
  })
})

const logger = { error() {}, warn() {}, info() {} } as never

/** a built server that answers each path with its document and its page object */
const serverOf = (pages: Record<string, { doc: Response; visit: Response }>) => async () => ({
  fetch: async (path: string, headers: Record<string, string> = {}) =>
    path === '/__fondu/prerender'
      ? Response.json({ version: 'v1', paths: Object.keys(pages), problems: [] })
      : 'X-Fondu' in headers
        ? pages[path]!.visit.clone()
        : pages[path]!.doc.clone(),
  dispose: async () => {},
})
/** a page with an inline script that has the build's nonce, and these headers besides */
const pageOf = (_path: string, more: Record<string, string> = {}) => ({
  doc: new Response('<script nonce="abc">a()</script>', {
    headers: {
      'content-security-policy': "script-src 'nonce-abc'",
      'referrer-policy': 'same-origin',
      'set-cookie': 'x=1',
      ...more,
    },
  }),
  visit: Response.json({ component: 'x' }),
})

describe('the build', () => {
  // a built server that lists one page, and answers it as given
  const build = (doc: Response, visit: Response) =>
    prerender(
      async () => ({
        fetch: async (path, headers = {}) =>
          path === '/__fondu/prerender'
            ? Response.json({ version: 'v1', paths: ['/x'], problems: [] })
            : 'X-Fondu' in headers
              ? visit
              : doc,
        dispose: async () => {},
      }),
      '/nowhere',
      logger,
      { serverDir: '/nowhere' },
    )
  const page = () => Response.json({ component: 'x' })
  test('a page that is not a 200 fails it, saying to which request: the document, or the navigation', async () => {
    const away = new Response(null, { status: 302, headers: { Location: '/login' } })
    await expect(build(away, page())).rejects.toThrow('/x: 302 → /login as a document')
    await expect(build(new Response('<html>'), away)).rejects.toThrow(
      '/x: 302 → /login as a navigation',
    )
    await expect(build(new Response('', { status: 500 }), away)).rejects.toThrow(
      '/x: 500 as a document',
    )
  })

  test('Node / Bun: the headers are written to prerender.json, next to the server, for all pages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fondu-build-'))
    try {
      await prerender(serverOf({ '/x': pageOf('/x') }), join(dir, 'client'), logger, {
        serverDir: join(dir, 'server'),
      })
      const { headers } = JSON.parse(readFileSync(join(dir, 'server/prerender.json'), 'utf8')) as {
        headers: Record<string, string>
      }
      expect(headers['content-security-policy']).toBe(
        `script-src 'sha256-${createHash('sha256').update('a()').digest('base64')}'`,
      )
      expect(headers['referrer-policy']).toBe('same-origin')
      expect(Object.keys(headers)).not.toContain('set-cookie')
      expect(existsSync(join(dir, 'client/x.html'))).toBe(true)
      expect(existsSync(join(dir, 'client/_headers'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
  test('pages whose security headers differ fail Node / Bun builds too: one set for all', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fondu-build-'))
    try {
      await expect(
        prerender(
          serverOf({
            '/x': pageOf('/x'),
            '/y': pageOf('/y', { 'referrer-policy': 'no-referrer' }),
          }),
          join(dir, 'client'),
          logger,
          { serverDir: join(dir, 'server') },
        ),
      ).rejects.toThrow('prerendering failed')
      expect(existsSync(join(dir, 'server/prerender.json'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
  test('no page to prerender: no prerender.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fondu-build-'))
    try {
      await prerender(serverOf({}), join(dir, 'client'), logger, { serverDir: dir })
      expect(existsSync(join(dir, 'prerender.json'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
})

describe('the app', () => {
  const app = createApp()
  test('the paths, only while the build prerenders', async () => {
    expect((await app.request('/__fondu/prerender')).status).toBe(404)
    const res = await app.request('/__fondu/prerender', {}, { FONDU_PRERENDER: '1' })
    expect(await res.json()).toEqual({
      version: 'v1',
      paths: ['/', '/de/hello', '/fr/hello', '/hello', '/users/1', '/users/2'],
      problems: [],
    })
  })
  test('the page object of a page without a file: the page, as a navigation', async () => {
    const res = await app.request('/_fondu/pages/index.json?fresh', {
      headers: { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' },
    })
    expect(res.headers.get('x-fondu')).toBe('true')
    const page = (await res.json()) as { component: string; url: string }
    expect(page.component).toBe('index')
    expect(page.url).toBe('/?fresh')
  })
  test('a prefetch of a page without a file: 204, no-store, no loader runs', async () => {
    const before = calls.counted
    const res = await app.request('/_fondu/pages/counted.json', {
      headers: { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1', 'X-Fondu-Prefetch': 'true' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.has('x-fondu')).toBe(false)
    expect(await res.text()).toBe('')
    expect(calls.counted).toBe(before)
  })
  test('a page object asked for without X-Fondu-Prefetch: answered by the app as before', async () => {
    const before = calls.counted
    const res = await app.request('/_fondu/pages/counted.json', {
      headers: { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-fondu')).toBe('true')
    expect(((await res.json()) as { component: string }).component).toBe('counted')
    expect(calls.counted).toBe(before + 1)
  })
  test('the page object of a page object: none', async () => {
    const res = await app.request('/_fondu/pages/_fondu/pages/index.json.json', {
      headers: { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' },
    })
    expect(res.status).toBe(404)
  })
  test('… from other assets: reloaded at the page, not at the page object', async () => {
    const res = await app.request('/_fondu/pages/index.json', {
      headers: { 'X-Fondu': 'true', 'X-Fondu-Version': 'old' },
    })
    expect(res.status).toBe(409)
    expect(res.headers.get('x-fondu-location')).toBe('http://localhost/')
  })
})

describe('static pages, served by the built server (Node / Bun)', () => {
  const headers = {
    'content-security-policy': "script-src 'self' 'sha256-x'",
    'x-frame-options': 'DENY',
  }
  const files: Record<string, string> = {
    'index.html': '<html>home</html>',
    'docs/index.html': '<html>docs</html>',
    'a b.html': '<html>a b</html>',
    '_fondu/pages/index.json': '{"component":"home"}',
  }
  // as serveStatic: the file the path (or its rewrite) names under root, else the next handler; `seen` has what it was asked
  const seen: string[] = []
  const fake: ServeStatic = (options) => async (c, next) => {
    const name = decodeURI(c.req.path) // serveStatic decodes the (already decoded) path once more
    const file = options.rewriteRequestPath ? options.rewriteRequestPath(name) : name.slice(1)
    seen.push(`${options.root}:${file}`)
    return file in files ? new Response(files[file], { status: 200 }) : next()
  }
  const main = new Hono()
  main.use('*', staticPages(fake, '/client', headers))
  main.all('*', (c) => c.text('app', 404))
  const get = (path: string, init: RequestInit = {}) => {
    seen.length = 0
    return main.request(path, { headers: { Accept: 'text/html' }, ...init })
  }

  test("a document request: its file, with the build's headers", async () => {
    const res = await get('/')
    expect(await res.text()).toBe('<html>home</html>')
    expect(seen).toEqual(['/client:index.html'])
    expect(res.headers.get('content-security-policy')).toBe(headers['content-security-policy'])
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(res.headers.has('x-fondu')).toBe(false)
    expect(await (await get('/docs/')).text()).toBe('<html>docs</html>')
    expect(await (await get('/a%20b')).text()).toBe('<html>a b</html>')
    expect((await get('/', { method: 'HEAD' })).status).toBe(200)
  })
  test('a page object: its file, with X-Fondu and the same headers', async () => {
    const res = await get('/_fondu/pages/index.json', { headers: { 'X-Fondu': 'true' } })
    expect(await res.text()).toBe('{"component":"home"}')
    expect(seen).toEqual(['/client:_fondu/pages/index.json'])
    expect(res.headers.get('x-fondu')).toBe('true')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect((await get('/_fondu/pages/index.json', { headers: {} })).headers.get('x-fondu')).toBe(
      'true',
    )
  })
  test('the app answers: no file, a navigation to the page itself, no document request, another method', async () => {
    for (const [path, init] of [
      ['/items', {}],
      ['/_fondu/pages/items.json', {}],
      ['/', { headers: { Accept: 'text/html', 'X-Fondu': 'true' } }],
      ['/', { headers: { Accept: 'application/json' } }],
      ['/', { headers: {} }],
      ['/', { method: 'POST' }],
      ['/_fondu/pages/index.json', { method: 'POST' }],
    ] as const) {
      const res = await get(path, init)
      expect(await res.text(), `${init.method ?? ''} ${path}`).toBe('app')
    }
  })
  test("a URL ending in index is never a document file (its directory's is another page)", async () => {
    for (const path of ['/index', '/%69ndex', '/docs/index']) {
      expect(await (await get(path)).text(), path).toBe('app')
      expect(seen, path).toEqual([])
    }
  })
  test('a NUL byte: the app, serveStatic is not asked', async () => {
    for (const path of ['/a%00', '/_fondu/pages/index%00.json']) {
      expect(await (await get(path)).text(), path).toBe('app')
      expect(seen, path).toEqual([])
    }
  })
  test('the path is decoded once: what serveStatic gives is a name, not decoded again', async () => {
    await get('/%252e%252e/secret')
    expect(seen).toEqual(['/client:%2e%2e/secret.html'])
  })
  test("what serveStatic did not serve gets no headers (the app's response)", async () => {
    const res = await get('/items')
    expect(res.headers.has('x-frame-options')).toBe(false)
    expect(res.headers.has('cache-control')).toBe(false)
  })
})
