// fondu/client imports react-dom/client for the browser's sake and the server never mounts a page: a stub (that says so if
// called) takes its place, as on Cloudflare
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { type BuiltApp, buildApp, type Running, start } from './build-app.js'

describe.each([['node'], ['bun']] as const)('the built %s server', (target) => {
  let app: BuiltApp
  beforeAll(async () => {
    app = await buildApp(
      { 'app/routes/index.tsx': `export default function Home() { return <h1>Home</h1> }\n` },
      { target },
    )
  }, 120_000)
  afterAll(() => app?.remove())

  test('does not import react-dom/client', () => {
    const files = readdirSync(app.server).filter((f) => f.endsWith('.js'))
    expect(files).toContain('index.js')
    // an import (the stub's own message names the module): `from"react-dom/client"`, `import("react-dom/client")`
    const imports = /(?:from|import)\s*\(?\s*["'`]react-dom\/client/
    expect(files.filter((f) => imports.test(readFileSync(join(app.server, f), 'utf8')))).toEqual([])
  })
  test('carries the stub, which says what it is if called', () => {
    const all = readdirSync(app.server)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(app.server, f), 'utf8'))
      .join('\n')
    expect(all).toContain('runs in the browser, not in the server')
  })
  test.runIf(target === 'node')('still answers a page', async () => {
    let server: Running | undefined
    try {
      server = await start(app)
      const res = await fetch(server.url, { headers: { accept: 'text/html' } })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('"component":"index"')
    } finally {
      await server?.stop()
    }
  })
})
