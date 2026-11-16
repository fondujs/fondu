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
    test(`${target}, sourcemap: ${JSON.stringify(sourcemap)}: a loader's source is not in the client build`, async () => {
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
        // what is not a route file keeps its source
        map.sources.forEach((s, i) => {
          if (s.endsWith('app/routes/index.tsx')) expect(map.sourcesContent[i]).toBeNull()
          // a file the strip did not change keeps its source
          if (s.endsWith('app/routes/about.tsx'))
            expect(map.sourcesContent[i]).toContain('ABOUT_PAGE')
          if (s.endsWith('app/routes/_layout.tsx'))
            expect(map.sourcesContent[i]).toContain('LAYOUT')
        })
      }
      expect(sources.some((s) => s.endsWith('app/routes/index.tsx'))).toBe(true)
      expect(sources.some((s) => s.endsWith('app/routes/about.tsx'))).toBe(true)
    })
})
