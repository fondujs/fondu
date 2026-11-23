import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from 'fondu'
import { Hono } from 'hono'
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
  page: true,
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
  test('data blocks are not hashed; the scripts the browser runs are (#268)', () => {
    const run = (code: string, attrs = '') => `<script nonce="abc"${attrs}>${code}</script>`
    const hash = (code: string) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`
    const html =
      run('a()') +
      run('b()', ' type="module"') +
      run('c()', ' type="text/javascript"') +
      run('{}', ' type="importmap"') +
      run('{"x":1}', ' type="application/ld+json"') +
      run('{"y":2}', ' type="application/json"')
    expect(ownScripts(html, "script-src 'nonce-abc'").hashes).toEqual(
      ['a()', 'b()', 'c()', '{}'].map(hash),
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
    expect(ownScripts(html, "script-src 'self'")).toEqual({ html, hashes: [] })
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
      route('api.ts', '/api', [undefined, true], { get: false, others: ['POST'] }),
    ])
    expect(paths).toEqual(['/', '/blog/a', '/blog/b%20c'])
    expect(problems).toEqual([])
  })
  test('what cannot be prerendered fails the build, naming the route', async () => {
    const { paths, problems } = await prerenderPaths([
      route('pricing.ts', '/pricing', [undefined, true], { others: ['POST'] }),
      route('blog/[slug].ts', '/blog/:slug', [undefined, true]),
      route('docs/[...path].ts', '/docs/:path*', [() => [{ path: '../x' }]]),
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

describe('paths: a .ts route is a file', () => {
  test('its URL is listed as a file, a page as a page', async () => {
    const { paths, files, problems } = await prerenderPaths([
      route('index.tsx', '/', [true]),
      route('feed.xml.ts', '/feed.xml', [true], { page: false }),
      route('data/[id].json.ts', '/data/:id.json', [() => [{ id: 'a b' }, { id: 2 }]], {
        page: false,
      }),
      route('off.xml.ts', '/off.xml', [false], { page: false }),
    ])
    expect(paths).toEqual(['/'])
    expect(files).toEqual(['/data/2.json', '/data/a%20b.json', '/feed.xml'])
    expect(problems).toEqual([])
  })
  test('a URL without an extension fails the build, naming the route', async () => {
    const { paths, files, problems } = await prerenderPaths([
      route('feed.ts', '/feed', [true], { page: false }),
      route('dir/index.ts', '/dir/', [true], { page: false }),
      route('[name].ts', '/:name', [() => [{ name: 'a.xml' }, { name: 'b' }]], { page: false }),
      route('dot.ts', '/.json', [true], { page: false }),
    ])
    expect(paths).toEqual([])
    expect(files).toEqual(['/a.xml'])
    expect(problems).toEqual([
      'routes/feed.ts: a prerendered .ts route writes a file: its URL needs an extension (feed.xml.ts)',
      'routes/dir/index.ts: a prerendered .ts route writes a file: its URL needs an extension (feed.xml.ts)',
      'routes/[name].ts: a prerendered .ts route writes a file: its URL needs an extension (feed.xml.ts)',
      'routes/dot.ts: a prerendered .ts route writes a file: its URL needs an extension (feed.xml.ts)',
    ])
  })
  test('an extension with no known content type fails the build, naming the route', async () => {
    const { files, problems } = await prerenderPaths([
      route('x.abc.ts', '/x.abc', [true], { page: false }),
      route('y.json.ts', '/y.json', [true], { page: false }),
    ])
    expect(files).toEqual(['/y.json'])
    expect(problems).toEqual(['routes/x.abc.ts: no content type is known for .abc'])
  })
  test("a directory's setting is for its pages: a .ts route needs its own export", async () => {
    const { paths, files, problems } = await prerenderPaths([
      route('docs/intro.tsx', '/docs/intro', [undefined, true]),
      route('docs/api/health.ts', '/docs/api/health', [undefined, true], { page: false }),
      route('docs/feed.xml.ts', '/docs/feed.xml', [undefined, true], { page: false }),
      route('docs/off.xml.ts', '/docs/off.xml', [false, true], { page: false }),
      route('docs/on.xml.ts', '/docs/on.xml', [true, false], { page: false }),
    ])
    expect(paths).toEqual(['/docs/intro'])
    expect(files).toEqual(['/docs/on.xml'])
    expect(problems).toEqual([])
  })
  test('a page may still end in a dot name or in index', async () => {
    const { paths, problems } = await prerenderPaths([
      route('v1.2.tsx', '/v1.2', [true]),
      route('feed.tsx', '/feed', [true]),
    ])
    expect(paths).toEqual(['/feed', '/v1.2'])
    expect(problems).toEqual([])
  })
})

describe('paths: prerender itself fails', () => {
  test('a function that throws: the file of the export, and the export', async () => {
    const { problems } = await prerenderPaths([
      route('items/[id].tsx', '/items/:id', [undefined, () => Promise.reject(new Error('no db'))], {
        settingFiles: ['items/[id].tsx', '_middleware.ts'],
      }),
    ])
    expect(problems).toEqual(['routes/_middleware.ts: prerender failed: no db'])
  })
  test('a function that does not return a list', async () => {
    const { problems } = await prerenderPaths([
      route('items/[id].tsx', '/items/:id', [(() => 5) as never]),
    ])
    expect(problems).toEqual([
      'routes/items/[id].tsx: prerender returns a list of params, [{ id: 1 }], not number',
    ])
  })
})

describe('paths: a param is one file name', () => {
  const pages = (pattern: string, ...values: Array<Record<string, string>>) =>
    prerenderPaths([route('x/[id].ts', pattern, [() => values])])
  test('a separator, or a dot segment, in a value fails the build, naming the route and the value', async () => {
    for (const id of ['../../outside', 'a/b', '/abs', 'a\\b', '..\\..\\outside', '.', '..']) {
      const { paths, problems } = await pages('/items/:id', { id })
      expect(paths).toEqual([])
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain('routes/x/[id].ts')
      expect(problems[0]).toContain(JSON.stringify(id))
    }
  })
  test('a catch-all keeps its slashes, but no segment is a dot segment or has a backslash', async () => {
    const all = (path: string) =>
      prerenderPaths([route('docs/[...path].ts', '/docs/:path*', [() => [{ path }]])])
    expect((await all('a/b/c')).paths).toEqual(['/docs/a/b/c'])
    for (const path of ['a/../b', 'a/./b', '../x', 'a\\b', 'a//b'])
      expect((await all(path)).problems).toHaveLength(1)
  })
  test('what is a file name stays: Unicode, spaces, dots, percent signs', async () => {
    const { paths, problems } = await pages(
      '/items/:id',
      { id: 'café' },
      { id: 'a b' },
      { id: 'v1.2' },
      { id: '100%' },
      { id: '%2f' },
      { id: '..a' },
    )
    expect(problems).toEqual([])
    expect(paths).toHaveLength(6)
  })
})

const logger = { error() {}, warn() {}, info() {} } as never

const serverOf =
  (
    pages: Record<string, { doc: Response; visit: Response }>,
    files: Record<string, Response> = {},
  ) =>
  async () => ({
    fetch: async (path: string, headers: Record<string, string> = {}) =>
      path === '/_fondu/prerender'
        ? Response.json({
            version: 'v1',
            paths: Object.keys(pages),
            files: Object.keys(files),
            problems: [],
          })
        : path in files
          ? files[path]!.clone()
          : 'X-Fondu' in headers
            ? pages[path]!.visit.clone()
            : pages[path]!.doc.clone(),
    dispose: async () => {},
  })
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
  const build = (doc: Response, visit: Response) =>
    prerender(
      async () => ({
        fetch: async (path, headers = {}) =>
          path === '/_fondu/prerender'
            ? Response.json({ version: 'v1', paths: ['/x'], files: [], problems: [] })
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

  test("each answer is read before the next request: wrangler's fetch can cancel one left unread (#273)", async () => {
    // Wrangler's `fetch` hands back a Response that shares the body stream of undici's own. When that one is garbage
    // collected, undici cancels the stream if nothing has read it. Here the next request does it, which is the same,
    // but at the same time every run.
    let unread: Response | undefined
    const dir = mkdtempSync(join(tmpdir(), 'fondu-build-'))
    try {
      await prerender(
        async () => ({
          fetch: async (path: string, headers: Record<string, string> = {}) => {
            if (unread && !unread.bodyUsed && !unread.body!.locked)
              await unread.body!.cancel('Response object has been garbage collected')
            if (path === '/_fondu/prerender')
              return Response.json({ version: 'v1', paths: ['/x', '/y'], files: [], problems: [] })
            return (unread =
              'X-Fondu' in headers
                ? Response.json({ component: path })
                : new Response(`<p>${path}</p>`))
          },
          dispose: async () => {},
        }),
        join(dir, 'client'),
        logger,
        { serverDir: join(dir, 'server') },
      )
      expect(readFileSync(join(dir, 'client/x.html'), 'utf8')).toBe('<p>/x</p>')
      expect(readFileSync(join(dir, 'client/_fondu/pages/y.json'), 'utf8')).toBe(
        '{"component":"/y"}',
      )
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  describe('the output stays in the client directory', () => {
    const inTemp = async (
      paths: string[],
      check: (dir: string, run: Promise<void>) => Promise<void>,
    ) => {
      const dir = mkdtempSync(join(tmpdir(), 'fondu-build-'))
      try {
        const pages = Object.fromEntries(paths.map((p) => [p, pageOf(p)]))
        await check(
          dir,
          prerender(serverOf(pages), join(dir, 'client'), logger, {
            serverDir: join(dir, 'server'),
          }),
        )
      } finally {
        rmSync(dir, { recursive: true })
      }
    }
    const written = (dir: string): string[] =>
      readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name))
    test('a path that resolves outside it is refused before anything is written', async () => {
      for (const path of [
        '/items/..%2F..%2Foutside',
        '/..%2Foutside',
        '/a%5C..%5Coutside',
        '/%2e%2e%2foutside',
      ])
        await inTemp(['/ok', path], async (dir, run) => {
          await expect(run).rejects.toThrow('prerendering failed')
          expect(written(dir)).toEqual([])
        })
    })
    test('every output is checked: the page objects too', async () => {
      await inTemp(['/ok', '/x%2F..%2F..%2F..%2F..%2Foutside'], async (dir, run) => {
        await expect(run).rejects.toThrow('prerendering failed')
        expect(written(dir)).toEqual([])
      })
    })
    test('two paths for one file fail the build: nothing is overwritten', async () => {
      await inTemp(['/caf%C3%A9', '/café'], async (dir, run) => {
        await expect(run).rejects.toThrow('prerendering failed')
        expect(written(dir)).toEqual([])
      })
      await inTemp(['/a', '/a.html/b'], async (dir, run) => {
        await expect(run).rejects.toThrow('prerendering failed')
        expect(written(dir)).toEqual([])
      })
    })
    test('Unicode and encoded names are written inside', async () => {
      await inTemp(['/café', '/a%20b', '/docs/x/y'], async (dir, run) => {
        await run
        for (const file of ['café.html', 'a b.html', 'docs/x/y.html', '_fondu/pages/café.json'])
          expect(existsSync(join(dir, 'client', file))).toBe(true)
      })
    })
  })
  describe('a .ts route is a file', () => {
    const inTemp = async (
      pages: Record<string, { doc: Response; visit: Response }>,
      files: Record<string, Response>,
      check: (dir: string, run: Promise<void>) => Promise<void>,
    ) => {
      const dir = mkdtempSync(join(tmpdir(), 'fondu-build-'))
      try {
        await check(
          dir,
          prerender(serverOf(pages, files), join(dir, 'client'), logger, {
            serverDir: join(dir, 'server'),
          }),
        )
      } finally {
        rmSync(dir, { recursive: true })
      }
    }
    const xml = (body: string, type = 'application/xml; charset=utf-8') =>
      new Response(body, { headers: { 'content-type': type } })
    test('its body is written as it is, at its path: no .html, no page object, no header of a page', async () => {
      const bytes = new Uint8Array([0, 255, 128, 10])
      await inTemp(
        {},
        {
          '/feed.xml': xml('<rss/>'),
          '/a%20b/data.json': new Response('{"a":1}', {
            headers: { 'content-type': 'application/json' },
          }),
          '/logo.png': new Response(bytes, { headers: { 'content-type': 'image/png' } }),
        },
        async (dir, run) => {
          await run
          expect(readFileSync(join(dir, 'client/feed.xml'), 'utf8')).toBe('<rss/>')
          expect(readFileSync(join(dir, 'client/a b/data.json'), 'utf8')).toBe('{"a":1}')
          expect([...readFileSync(join(dir, 'client/logo.png'))]).toEqual([...bytes])
          expect(
            readdirSync(join(dir, 'client'), { recursive: true, encoding: 'utf8' })
              .map((f) => f.replaceAll('\\', '/'))
              .sort(),
          ).toEqual(['a b', 'a b/data.json', 'feed.xml', 'logo.png'])
          expect(JSON.parse(readFileSync(join(dir, 'server/prerender.json'), 'utf8'))).toEqual({
            headers: {},
            files: ['/feed.xml', '/a%20b/data.json', '/logo.png'],
          })
        },
      )
    })
    test('pages and files together: pages as before', async () => {
      await inTemp({ '/x': pageOf('/x') }, { '/feed.xml': xml('<rss/>') }, async (dir, run) => {
        await run
        expect(existsSync(join(dir, 'client/x.html'))).toBe(true)
        expect(existsSync(join(dir, 'client/_fondu/pages/x.json'))).toBe(true)
        expect(readFileSync(join(dir, 'client/feed.xml'), 'utf8')).toBe('<rss/>')
      })
    })
    test('Cloudflare: the file goes to the client directory, and _headers is written', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'fondu-build-'))
      try {
        await prerender(serverOf({}, { '/feed.xml': xml('<rss/>') }), join(dir, 'client'), logger, {
          headersFile: true,
        })
        expect(readFileSync(join(dir, 'client/feed.xml'), 'utf8')).toBe('<rss/>')
        expect(existsSync(join(dir, 'client/_headers'))).toBe(true)
      } finally {
        rmSync(dir, { recursive: true })
      }
    })
    test("a Content-Type that is not the extension's fails the build, saying both", async () => {
      await inTemp(
        {},
        { '/feed.xml': xml('<rss/>', 'application/rss+xml'), '/a.json': xml('x', 'text/html') },
        async (dir, run) => {
          const error = await run.then(
            () => undefined,
            (e: Error) => e,
          )
          expect(error?.message).toContain('prerendering failed')
          expect(existsSync(join(dir, 'client/feed.xml'))).toBe(false)
        },
      )
      const messages: string[] = []
      await expect(
        prerender(
          serverOf({}, { '/feed.xml': xml('<rss/>', 'application/rss+xml') }),
          '/nowhere',
          { error: (m: string) => messages.push(m), warn() {}, info() {} } as never,
          { serverDir: '/nowhere' },
        ),
      ).rejects.toThrow('prerendering failed')
      expect(messages).toEqual([
        'fondu: /feed.xml: it answers application/rss+xml, but a static file ending in .xml is served as application/xml',
      ])
    })
    test('no Content-Type at all fails too; a charset or case is not a difference', async () => {
      await inTemp(
        {},
        { '/a.json': new Response('{}', { headers: { 'content-type': '' } }) },
        async (_dir, run) => {
          await expect(run).rejects.toThrow('prerendering failed')
        },
      )
      await inTemp(
        {},
        { '/a.xml': xml('<a/>', 'Application/XML;charset=utf-8') },
        async (dir, run) => {
          await run
          expect(existsSync(join(dir, 'client/a.xml'))).toBe(true)
        },
      )
    })
    test('a file that is not a 200 fails the build, nothing written', async () => {
      await inTemp(
        {},
        { '/feed.xml': new Response(null, { status: 302, headers: { Location: '/login' } }) },
        async (dir, run) => {
          await expect(run).rejects.toThrow('prerendering failed')
          expect(existsSync(join(dir, 'client/feed.xml'))).toBe(false)
        },
      )
    })
    test('a file that is a page’s file or its directory fails the build', async () => {
      await inTemp(
        { '/a': pageOf('/a') },
        { '/a.html': xml('x', 'text/html') },
        async (dir, run) => {
          await expect(run).rejects.toThrow('prerendering failed')
          expect(existsSync(join(dir, 'client'))).toBe(false)
        },
      )
      await inTemp({ '/a.xml/b': pageOf('/a.xml/b') }, { '/a.xml': xml('x') }, async (dir, run) => {
        await expect(run).rejects.toThrow('prerendering failed')
        expect(existsSync(join(dir, 'client'))).toBe(false)
      })
    })
    test('a path that leaves the client directory fails before anything is written', async () => {
      await inTemp({}, { '/..%2Foutside.xml': xml('x') }, async (dir, run) => {
        await expect(run).rejects.toThrow('prerendering failed')
        expect(existsSync(join(dir, 'client'))).toBe(false)
      })
    })
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
  test('pages whose JSON-LD differs build: the policy has the hashes of the executable scripts only (#268)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fondu-build-'))
    try {
      const page = (ld: string) => ({
        doc: new Response(
          `<script nonce="abc">a()</script><script nonce="abc" type="application/ld+json">${ld}</script>`,
          { headers: { 'content-security-policy': "script-src 'nonce-abc'" } },
        ),
        visit: Response.json({ component: 'x' }),
      })
      await prerender(
        serverOf({ '/x': page('{"name":"x"}'), '/y': page('{"name":"y"}') }),
        join(dir, 'client'),
        logger,
        { serverDir: join(dir, 'server') },
      )
      const { headers } = JSON.parse(readFileSync(join(dir, 'server/prerender.json'), 'utf8')) as {
        headers: Record<string, string>
      }
      expect(headers['content-security-policy']).toBe(
        `script-src 'sha256-${createHash('sha256').update('a()').digest('base64')}'`,
      )
      expect(readFileSync(join(dir, 'client/y.html'), 'utf8')).toContain(
        'type="application/ld+json">{"name":"y"}</script>',
      )
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
    expect((await app.request('/_fondu/prerender')).status).toBe(404)
    const res = await app.request('/_fondu/prerender', {}, { FONDU_PRERENDER: '1' })
    expect(await res.json()).toEqual({
      version: 'v1',
      paths: ['/'],
      files: [],
      problems: [
        'routes/users/[id].ts: a prerendered .ts route writes a file: its URL needs an extension (feed.xml.ts)',
        'routes/users/[id].ts: a prerendered .ts route writes a file: its URL needs an extension (feed.xml.ts)',
      ],
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
  test('a prefetch is answered before the flash: the cookie is neither read nor cleared', async () => {
    const res = await app.request('/_fondu/pages/index.json', {
      headers: {
        'X-Fondu': 'true',
        'X-Fondu-Version': 'v1',
        'X-Fondu-Prefetch': 'true',
        Cookie: 'fondu-flash=' + encodeURIComponent(JSON.stringify({ flash: { message: 'hi' } })),
      },
    })
    expect([res.status, res.headers.get('set-cookie')]).toEqual([204, null])
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
    expect(res.headers.get('x-fondu-location')).toBe('/')
  })
  test('the page of a path with a trailing slash: the redirect is relative, never to another site', async () => {
    for (const [path, to] of [
      ['/_fondu/pages/items/.json', '/items'],
      ['/_fondu/pages//evil.com/.json', '/evil.com'],
    ] as const) {
      const res = await app.request(path, {
        headers: { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' },
      })
      expect([res.status, res.headers.get('location')], path).toEqual([301, to])
    }
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
  test('the trailing-slash redirect of the app behind it: relative, as it is without staticPages', async () => {
    const both = new Hono()
    both.use('*', staticPages(fake, '/client', headers))
    both.all('*', (c) => createApp().fetch(c.req.raw))
    for (const [path, to] of [
      ['/items/?x=1', '/items?x=1'],
      ['//evil.com/', '/evil.com'],
    ] as const) {
      const res = await both.request(path, { headers: { Accept: 'text/html' } })
      expect([res.status, res.headers.get('location')], path).toEqual([301, to])
    }
    expect(await (await both.request('/docs/', { headers: { Accept: 'text/html' } })).text()).toBe(
      '<html>docs</html>',
    )
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
  test("a prerendered file: served by its path, whatever Accept says, with the build's headers", async () => {
    const withFile = new Hono()
    files['feed.xml'] = '<rss/>'
    withFile.use('*', staticPages(fake, '/client', headers, ['/feed.xml']))
    withFile.all('*', (c) => c.text('app', 404))
    for (const accept of ['application/xml', 'text/html', '*/*']) {
      seen.length = 0
      const res = await withFile.request('/feed.xml', { headers: { Accept: accept } })
      expect(await res.text(), accept).toBe('<rss/>')
      expect(seen).toEqual(['/client:feed.xml'])
      expect(res.headers.get('x-frame-options')).toBe('DENY')
      expect(res.headers.get('x-fondu')).toBe(null)
    }
    expect((await withFile.request('/feed.xml', { method: 'POST' })).status).toBe(404)
    expect(await (await withFile.request('/other.xml')).text()).toBe('app')
    delete files['feed.xml']
  })
  test("what serveStatic did not serve gets no headers (the app's response)", async () => {
    const res = await get('/items')
    expect(res.headers.has('x-frame-options')).toBe(false)
    expect(res.headers.has('cache-control')).toBe(false)
  })
})
