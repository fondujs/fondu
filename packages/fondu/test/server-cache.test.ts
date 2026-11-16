// The built Node server's Cache-Control of the client build's files: the immutable one only on a file served
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { type BuiltApp, buildApp, type Running, start } from './build-app.js'

const files = (dir: string) => ({
  'app/routes/index.tsx': `export default function Home() { return <h1>Home</h1> }\n`,
  // an app route under the assets directory, with a Cache-Control of its own
  [`app/routes/${dir}/[id].ts`]: `import { defineHandler } from 'fondu'
export const GET = defineHandler((c) => {
  c.header('Cache-Control', 'no-store')
  return c.text('route ' + c.req.param('id'))
})
`,
  [`app/routes/${dir}/plain.ts`]: `import { defineHandler } from 'fondu'
export const GET = defineHandler((c) => c.text('plain'))
`,
})

const IMMUTABLE = 'public, max-age=31536000, immutable'

describe.each([['assets'], ['static']])('a built Node server, assetsDir %s', (dir) => {
  let app: BuiltApp, server: Running
  beforeAll(async () => {
    app = await buildApp(files(dir), { assetsDir: dir === 'assets' ? undefined : dir })
    server = await start(app)
  }, 120_000)
  afterAll(async () => {
    await server?.stop()
    app?.remove()
  })

  test('a route under the assets directory keeps its own Cache-Control', async () => {
    const res = await fetch(`${server.url}/${dir}/42`)
    expect(await res.text()).toBe('route 42')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
  test('a route without one has none of the immutable', async () => {
    const res = await fetch(`${server.url}/${dir}/plain`)
    expect(await res.text()).toBe('plain')
    expect(res.headers.get('cache-control')).not.toBe(IMMUTABLE)
  })
  test('a built asset is immutable', async () => {
    const html = await (await fetch(server.url)).text()
    const src = /src="(\/[^"]+\.js)"/.exec(html)?.[1]
    expect(src, html).toMatch(new RegExp(`^/${dir}/`))
    const res = await fetch(server.url + src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(res.headers.get('cache-control')).toBe(IMMUTABLE)
  })
})
