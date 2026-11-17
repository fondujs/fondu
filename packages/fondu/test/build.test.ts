import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { checkExports } from '../src/server/app.js'
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
        const message = `fondu: routes/${file} exports \`${name}\`. It exports its component only (default)`
        await expect(buildClient(app.root)).rejects.toThrow(message)
        // the server's own check, at startup, says the same
        expect(() => checkExports(file, { default: () => null, [name]: () => ({}) })).toThrow(
          message,
        )
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
      // still valid, and still maps the client code
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
          // the source of a page's route file is its browser's copy: the loader and its import are gone, the
          // page and the lines of the rest stay
          if (s.endsWith('app/routes/index.tsx')) {
            const text = map.sourcesContent[i]!
            expect(text.split('\n')).toHaveLength(route.split('\n').length)
            expect(text.split('\n')[2]).toBe(route.split('\n')[2])
            expect(text).toContain('KEPT_IN_THE_BROWSER')
            expect(text).not.toContain('loader')
            expect(text).not.toContain('db.server')
          }
          // a file the strip did not change keeps its source
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
      // the setting of the entry: the default
      expect(code).toMatch(new RegExp(`viewTransitions:\\s*!${on ? '0' : '1'}\\b`))
    })
})
