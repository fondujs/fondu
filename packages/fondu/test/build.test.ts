import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'
import { afterEach, describe, expect, test } from 'vitest'

import { checkExports } from '../src/server/app.js'
import { routesPrerender } from '../src/vite/check.js'
import fondu from '../src/vite/index.js'
import { buildApp, start } from './build-app.js'
import { buildClient, tempApp } from './support/build.js'

const page = 'export default function Page() { return <p>page</p> }\n'
let app: ReturnType<typeof tempApp> | undefined
afterEach(() => app?.remove())

describe('server exports of a layout or an error page', () => {
  for (const file of ['_layout.tsx', '_error.tsx'])
    for (const name of ['loader', 'action', 'actions'])
      test(`${file} exporting ${name} fails the build, as the server does at startup`, async () => {
        app = tempApp({
          'app/routes/index.tsx': page,
          [`app/routes/${file}`]: `export default function X() { return null }\nexport const ${name} = () => ({})\n`,
        })
        const message = `fondu: routes/${file} exports \`${name}\`. It exports its component (default)${file === '_layout.tsx' ? ' and optional layout chain' : ''}`
        await expect(buildClient(app.root)).rejects.toThrow(message)
        expect(() => checkExports(file, { default: () => null, [name]: () => ({}) })).toThrow(
          message,
        )
      })
})

describe("a directory's own file with another extension", () => {
  for (const [file, is] of [
    ['admin/_middleware.tsx', "a directory's middleware is _middleware.ts"],
    ['_layout.ts', "a directory's layout is _layout.tsx"],
    ['_error.ts', 'the error page is _error.tsx'],
  ] as const)
    test(`${file} fails the build`, async () => {
      app = tempApp({
        'app/routes/index.tsx': page,
        [`app/routes/${file}`]: 'export default () => null\n',
      })
      await expect(buildClient(app.root)).rejects.toThrow(`fondu: routes/${file}: ${is}`)
    })
  test('the right names build', async () => {
    app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/admin/_middleware.ts': 'export default async (c, next) => next()\n',
      'app/routes/admin/_layout.tsx':
        'export default function L({ children }) { return children }\n',
      'app/routes/_parts/_middleware.tsx': 'export default () => null\n',
    })
    await buildClient(app.root)
  })
})

describe('a layout that is fine', () => {
  test('builds', async () => {
    app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/_layout.tsx': 'export default function L({ children }) { return children }\n',
      'app/routes/_error.tsx': 'export default function E() { return null }\n',
    })
    await buildClient(app.root)
  })
})

describe('source maps of the client build', () => {
  const canary = 'CANARY_LOADER_SECRET_7f3a'
  const route = `import { db } from '../db.server'\nexport async function loader() { return { secret: '${canary}' } }\nexport default function Page() { return <p>KEPT_IN_THE_BROWSER</p> }\n`
  for (const [target, sourcemap] of [
    ['node', true],
    ['node', 'hidden'],
    ['cloudflare', true],
    ['cloudflare', 'hidden'],
  ] as const)
    test(`${target}, sourcemap: ${JSON.stringify(sourcemap)}: a loader's source is not in the client build, maps included`, async () => {
      app = tempApp({
        'app/routes/index.tsx': route,
        'app/routes/about.tsx': 'export default function About() { return <p>ABOUT_PAGE</p> }\n',
        'app/routes/_layout.tsx':
          'export default function L({ children }) { return children } // LAYOUT\n',
        'app/db.server.ts': 'export const db = 1\n',
      })
      await buildClient(app.root, { target }, { build: { sourcemap } })
      // Cloudflare's client output is the Worker plugin's to set; without it, Vite's own `dist`
      const dist = join(app.root, target === 'node' ? 'dist/client' : 'dist')
      const files = readdirSync(dist, {
        recursive: true,
        encoding: 'utf8',
      })
      const maps = files.filter((f) => f.endsWith('.map'))
      expect(maps.length).toBeGreaterThan(0)
      for (const f of files) {
        if (statSync(join(dist, f)).isDirectory()) continue
        expect(readFileSync(join(dist, f), 'utf8').includes(canary), f).toBe(false)
      }
      const sources: string[] = []
      for (const f of maps) {
        const map = JSON.parse(readFileSync(join(dist, f), 'utf8')) as {
          sources: string[]
          sourcesContent: Array<string | null>
          mappings: string
        }
        expect(map.sourcesContent).toHaveLength(map.sources.length)
        expect(map.mappings).not.toBe('')
        sources.push(...map.sources)
        map.sources.forEach((s, i) => {
          // the source of a page's route file is its browser's copy: the loader and its import are gone
          if (s.endsWith('app/routes/index.tsx')) {
            const text = map.sourcesContent[i]!
            expect(text.split('\n')).toHaveLength(route.split('\n').length)
            expect(text.split('\n')[2]).toBe(route.split('\n')[2])
            expect(text).toContain('KEPT_IN_THE_BROWSER')
            expect(text).not.toContain('loader')
            expect(text).not.toContain('db.server')
          }
          if (s.endsWith('app/routes/about.tsx'))
            expect(map.sourcesContent[i]).toContain('ABOUT_PAGE')
          if (s.endsWith('app/routes/_layout.tsx'))
            expect(map.sourcesContent[i]).toContain('LAYOUT')
        })
      }
      expect(
        sources.some((s) => s.endsWith('app/routes/index.tsx')),
        'the route file is a source',
      ).toBe(true)
      expect(sources.some((s) => s.endsWith('app/routes/about.tsx'))).toBe(true)
    })
})

describe('what only a loader uses is not in the client build', () => {
  const canaries = ['NS_CANARY_a1', 'ENUM_CANARY_b2', 'ROWS_c3', 'LOADER_CANARY_d4']
  for (const verbatim of [false, true])
    test(`a namespace, an enum, type-only imports of a server module (verbatimModuleSyntax: ${verbatim})`, async () => {
      app = tempApp({
        'tsconfig.json': JSON.stringify({
          compilerOptions: { jsx: 'react-jsx', verbatimModuleSyntax: verbatim },
        }),
        'app/routes/index.tsx': [
          `import { type Row } from '../rows.server'`,
          `import type { Db } from '../rows.server'`,
          `import { Badge } from '../badge'`,
          `namespace Queries { export const q = () => 'NS_CANARY_a1' }`,
          `enum Secret { A = 'ENUM_CANARY_b2' }`,
          `export type Data = Awaited<ReturnType<typeof loader>>`,
          `export async function loader(): Promise<{ r: Row; d: Db }> { return { r: Queries.q() + Secret.A, d: 'LOADER_CANARY_d4' as never } }`,
          `export default function Page(p: { data: Data }) { return <Badge /> }`,
          ``,
        ].join('\n'),
        'app/badge.tsx': 'export const Badge = () => <b>BADGE_SHOWN</b>\n',
        'app/rows.server.ts': `export type Row = string\nexport type Db = number\nexport const ROWS = 'ROWS_c3'\n`,
      })
      await buildClient(app.root, {}, { build: { sourcemap: true } })
      const dist = join(app.root, 'dist/client')
      let all = ''
      for (const f of readdirSync(dist, { recursive: true, encoding: 'utf8' }))
        if (!statSync(join(dist, f)).isDirectory()) all += readFileSync(join(dist, f), 'utf8')
      for (const canary of canaries) expect(all, canary).not.toContain(canary)
      expect(all).toContain('BADGE_SHOWN')
    })
})

// `viewTransitions` only sets the default: the code of the view transitions is in the client either way (a navigation
// opts in on its own), and the option reaches it as a setting of the app's entry, not as a constant at build time
describe('the client bundle and the viewTransitions option', () => {
  const MARKS = ['navigation-forward', 'active-view-transition-type', '__fondu_index']
  const bundle = (root: string) => {
    const assets = join(root, 'dist/client/assets')
    return readdirSync(assets)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(assets, f), 'utf8'))
      .join('\n')
  }
  for (const on of [false, true])
    test(`option ${on ? 'on' : 'off'}: its code is in the client, and no constant of the build`, async () => {
      app = tempApp({ 'app/routes/index.tsx': page })
      await buildClient(app.root, { viewTransitions: on })
      const code = bundle(app.root)
      for (const mark of [...MARKS, '__fondu_transition'])
        expect(code.includes(mark), mark).toBe(true)
      expect(code).not.toContain('__FONDU_VIEW_TRANSITIONS__')
      expect(code).toMatch(new RegExp(`viewTransitions:\\s*!${on ? '0' : '1'}\\b`))
    })
})

describe('a hidden path under routes/', () => {
  const message =
    'fondu: routes/.well-known/ping.ts: a path starting with "." is not a route; serve it from public/ or answer it in a catch-all route'
  test('fails the build, as the server does at startup', async () => {
    app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/.well-known/ping.ts': 'export const GET = (c) => c.text("pong")\n',
    })
    await expect(buildClient(app.root)).rejects.toThrow(message)
  })
  test('a dot file with no route extension, and public/.well-known, build', async () => {
    app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/.gitkeep': '',
      'public/.well-known/ping': 'pong\n',
    })
    await buildClient(app.root)
  })
  test('typegen does not list it, nor a test of any extension', async () => {
    app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/about.tsx': page,
      'app/routes/about.test.mdx': '# a test\n',
      'app/routes/.well-known/ping.ts': 'export const GET = (c) => c.text("pong")\n',
    })
    const dev = await createServer({
      root: app.root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      plugins: [fondu({ target: 'node' })],
    })
    try {
      await dev.pluginContainer.buildStart({})
      const types = readFileSync(join(app.root, 'app/fondu.gen.d.ts'), 'utf8')
      expect(types).toContain('"/about"')
      expect(types).not.toContain('well-known')
      expect(types).not.toContain('test')
    } finally {
      await dev.close()
    }
  })
  test('the server refuses it at startup in development', async () => {
    app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/.well-known/ping.ts': 'export const GET = (c) => c.text("pong")\n',
      'app/server.ts': `import { createApp } from 'fondu'\nexport default createApp()\n`,
    })
    const dev = await createServer({
      root: app.root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      resolve: {
        alias: [
          ['fondu/client/internal', 'client/internal.ts'],
          ['fondu/client', 'client.ts'],
          ['fondu', 'index.ts'],
        ].map(([find, file]) => ({
          find: new RegExp(`^${find}$`),
          replacement: fileURLToPath(new URL(`../src/${file}`, import.meta.url)),
        })),
      },
      plugins: [fondu({ target: 'node' })],
    })
    try {
      await expect(dev.ssrLoadModule('/app/server.ts')).rejects.toThrow(message)
    } finally {
      await dev.close()
    }
  })
  test('a test of any extension is no route at startup', async () => {
    app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/about.test.mdx': '# a test\n',
      'app/routes/about.spec.mdx': '# a test\n',
      'app/server.ts': `import { createApp } from 'fondu'\nexport default createApp()\n`,
    })
    const dev = await createServer({
      root: app.root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      resolve: {
        alias: [
          ['fondu/client/internal', 'client/internal.ts'],
          ['fondu/client', 'client.ts'],
          ['fondu', 'index.ts'],
        ].map(([find, file]) => ({
          find: new RegExp(`^${find}$`),
          replacement: fileURLToPath(new URL(`../src/${file}`, import.meta.url)),
        })),
      },
      plugins: [fondu({ target: 'node' })],
    })
    try {
      const { default: server } = await dev.ssrLoadModule('/app/server.ts')
      for (const path of ['/about.test', '/about.spec'])
        expect((await server.request(path)).status, path).toBe(404)
    } finally {
      await dev.close()
    }
  })
})

describe('the server build checks the exports of every route file', () => {
  const built = async (files: Record<string, string>) => {
    const out = await buildApp({ 'app/routes/index.tsx': page, ...files })
    out.remove()
  }
  test('a page with an export that is not its own', async () => {
    await expect(
      built({ 'app/routes/about.tsx': `${page}export const foo = 1\n` }),
    ).rejects.toThrow('fondu: routes/about.tsx exports `foo`')
  })
  test('a .ts route with loader: it is GET', async () => {
    await expect(
      built({ 'app/routes/api.ts': 'export const loader = () => new Response("x")\n' }),
    ).rejects.toThrow('fondu: routes/api.ts exports `loader`')
  })
  test('a _middleware.ts with loader', async () => {
    await expect(
      built({
        'app/routes/admin/_middleware.ts':
          'export const loader = () => 1\nexport default async (c, next) => next()\n',
        'app/routes/admin/index.tsx': page,
      }),
    ).rejects.toThrow('fondu: routes/admin/_middleware.ts exports `loader`')
  })
  test('a layout that lists a component twice', async () => {
    await expect(
      built({
        'app/routes/about.tsx': `import Site from './_site'\nexport const layout = [Site, Site]\n${page}`,
        'app/routes/_site.tsx': 'export default function Site({ children }) { return children }\n',
      }),
    ).rejects.toThrow('fondu: routes/about.tsx: layout lists the same component twice')
  })
  test('valid route files build', async () => {
    await built({
      'app/routes/about.tsx': `export const loader = () => ({})\nexport const action = () => ({})\n${page}`,
      'app/routes/api.ts':
        'export const GET = () => new Response("x")\nexport const prerender = false\n',
      'app/routes/docs/_middleware.ts':
        'export default async (c, next) => next()\nexport const prerender = true\n',
      'app/routes/docs/index.tsx': page,
    })
  })
})

describe('prerendering follows the route exports', () => {
  const home = 'export default function Home() { return <p>home</p> }\n'
  const files = (extra: Record<string, string>) => ({ 'app/routes/index.tsx': home, ...extra })

  test('routesPrerender reads the export names of routes and _middleware.ts', () => {
    const cases: Array<[Record<string, string>, boolean]> = [
      [files({}), false],
      [files({ 'app/routes/index.tsx': `${home}export const prerender = true\n` }), true],
      [files({ 'app/routes/index.tsx': `${home}export const prerender = false\n` }), true],
      [files({ 'app/routes/api.ts': 'export const prerender = () => []\n' }), true],
      [files({ 'app/routes/docs/_middleware.ts': 'export const prerender = true\n' }), true],
      [files({ 'app/routes/index.tsx': `${home}const prerender = true\n` }), false],
      [files({ 'app/routes/index.tsx': `${home}// export const prerender = true\n` }), false],
      [files({ 'app/routes/_parts/x.ts': 'export const prerender = true\n' }), false],
      [files({ 'app/routes/x.test.ts': 'export const prerender = true\n' }), false],
      [files({ 'app/routes/other.ts': 'export { a as prerender } from "./a"\n' }), true],
    ]
    for (const [tree, expected] of cases) {
      app = tempApp(tree)
      expect(routesPrerender(app.root), JSON.stringify(Object.keys(tree))).toBe(expected)
      app.remove()
    }
  })

  test('a route that exports prerender is written, with no option', async () => {
    const out = await buildApp(
      files({ 'app/routes/index.tsx': `${home}export const prerender = true\n` }),
    )
    try {
      expect(readFileSync(join(out.dir, 'dist/client/index.html'), 'utf8')).toContain(
        '"component":"index"',
      )
      expect(existsSync(join(out.dir, 'dist/server/prerender.json'))).toBe(true)
      expect(existsSync(join(out.dir, 'dist/client/_fondu/pages/index.json'))).toBe(true)
    } finally {
      out.remove()
    }
  })

  test('a _middleware.ts that exports it prerenders the pages under it', async () => {
    const out = await buildApp(
      files({
        'app/routes/docs/_middleware.ts': 'export const prerender = true\n',
        'app/routes/docs/intro.tsx': home,
      }),
    )
    try {
      expect(existsSync(join(out.dir, 'dist/client/docs/intro.html'))).toBe(true)
      expect(existsSync(join(out.dir, 'dist/client/index.html'))).toBe(false)
    } finally {
      out.remove()
    }
  })

  test('a .ts route that exports prerender is written as the file it answers, and the built server serves it', async () => {
    const out = await buildApp(
      files({
        'app/routes/index.tsx': `${home}export const prerender = true\n`,
        'app/routes/feed.xml.ts': `export const GET = () => new Response('<rss/>', { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })\nexport const prerender = true\n`,
        'app/routes/data.json.ts': `export const GET = (c) => c.json({ n: 1 })\nexport const prerender = true\n`,
        'app/routes/files/[name]/data.json.ts': `export const GET = (c) => c.json({ built: process.env.FONDU_PRERENDER === '1' })\nexport const prerender = () => [{ name: 'café au lait' }]\n`,
      }),
    )
    const server = await start(out)
    try {
      const client = join(out.dir, 'dist/client')
      expect(readFileSync(join(client, 'feed.xml'), 'utf8')).toBe('<rss/>')
      expect(readFileSync(join(client, 'data.json'), 'utf8')).toBe('{"n":1}')
      expect(readFileSync(join(client, 'files/café au lait/data.json'), 'utf8')).toBe(
        '{"built":true}',
      )
      for (const file of ['feed.xml.html', 'data.json.html', '_fondu/pages/feed.xml.json'])
        expect(existsSync(join(client, file)), file).toBe(false)
      expect(existsSync(join(client, 'index.html'))).toBe(true)
      expect(
        JSON.parse(readFileSync(join(out.dir, 'dist/server/prerender.json'), 'utf8')).files,
      ).toEqual(['/data.json', '/feed.xml', '/files/caf%C3%A9%20au%20lait/data.json'])
      for (const [path, type, body] of [
        ['/feed.xml', 'application/xml', '<rss/>'],
        ['/data.json', 'application/json', '{"n":1}'],
        ['/files/caf%C3%A9%20au%20lait/data.json', 'application/json', '{"built":true}'],
        [
          '/files/%63af%c3%a9%20au%20lait/data.json?download=1',
          'application/json',
          '{"built":true}',
        ],
      ] as const) {
        const res = await fetch(server.url + path)
        expect(res.status, path).toBe(200)
        expect(res.headers.get('content-type'), path).toContain(type)
        expect(await res.text(), path).toBe(body)
        expect(res.headers.get('x-frame-options'), path).toBe('SAMEORIGIN')
        expect(res.headers.get('cache-control'), path).toBe('private, no-cache')
      }
      const head = await fetch(server.url + '/files/caf%C3%A9%20au%20lait/data.json?download=1', {
        method: 'HEAD',
      })
      expect(head.status).toBe(200)
      expect(head.headers.get('cache-control')).toBe('private, no-cache')
      expect(await head.text()).toBe('')
    } finally {
      await server.stop()
      out.remove()
    }
  })

  test("a .ts route under a directory's prerender is not written, and the build passes", async () => {
    const out = await buildApp(
      files({
        'app/routes/docs/_middleware.ts': 'export const prerender = true\n',
        'app/routes/docs/intro.tsx': home,
        'app/routes/docs/health.ts': `export const GET = (c) => c.json({ ok: true })\n`,
      }),
    )
    const server = await start(out)
    try {
      expect(existsSync(join(out.dir, 'dist/client/docs/intro.html'))).toBe(true)
      for (const file of ['docs/health', 'docs/health.html', '_fondu/pages/docs/health.json'])
        expect(existsSync(join(out.dir, 'dist/client', file)), file).toBe(false)
      expect(await (await fetch(`${server.url}/docs/health`)).json()).toEqual({ ok: true })
    } finally {
      await server.stop()
      out.remove()
    }
  })

  test('a .ts route whose extension has no known content type fails the build', async () => {
    await expect(
      buildApp(
        files({
          'app/routes/x.abc.ts': `export const GET = () => new Response('x')\nexport const prerender = true\n`,
        }),
      ),
    ).rejects.toThrow('routes/x.abc.ts: no content type is known for .abc')
  })

  test('a .ts route whose URL has no extension fails the build, naming the route', async () => {
    await expect(
      buildApp(
        files({
          'app/routes/feed.ts': `export const GET = () => new Response('<rss/>')\nexport const prerender = true\n`,
        }),
      ),
    ).rejects.toThrow(
      'prerendering failed (routes/feed.ts: a prerendered .ts route writes a file: its URL needs an extension (feed.xml.ts))',
    )
  })

  test("a .ts route whose Content-Type is not its extension's fails the build, saying both", async () => {
    await expect(
      buildApp(
        files({
          'app/routes/feed.xml.ts': `export const GET = () => new Response('<rss/>', { headers: { 'Content-Type': 'application/rss+xml' } })\nexport const prerender = true\n`,
        }),
      ),
    ).rejects.toThrow(
      '/feed.xml: it answers application/rss+xml, but a static file ending in .xml is served as application/xml',
    )
  })

  test('no route exports it: no prerender step, and the server answers no page object', async () => {
    const out = await buildApp(files({}))
    const server = await start(out)
    try {
      expect(existsSync(join(out.dir, 'dist/client/index.html'))).toBe(false)
      expect(existsSync(join(out.dir, 'dist/server/prerender.json'))).toBe(false)
      expect((await fetch(`${server.url}/_fondu/pages/index.json`)).status).toBe(404)
    } finally {
      await server.stop()
      out.remove()
    }
  })
})
