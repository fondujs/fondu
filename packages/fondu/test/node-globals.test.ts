import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { devServerNodeServer } from '../src/vite/node-server.js'

describe('the dev server’s @hono/node-server, as installed', () => {
  test('is found, and is the ES module with getRequestListener', async () => {
    const { getRequestListener } = await devServerNodeServer()
    expect(typeof getRequestListener).toBe('function')
    // Request and Response of its listener are @hono/node-server's own, which the dev server's requests are made with
    expect(() => getRequestListener(() => new Response())).not.toThrow()
  })
})

describe('when the assumption fails', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const fake = (pkg: unknown, files: Record<string, string> = {}) => {
    dir = mkdtempSync(join(tmpdir(), 'fondu-node-server-'))
    const base = join(dir, 'node_modules/@hono')
    mkdirSync(join(base, 'node-server/dist'), { recursive: true })
    mkdirSync(join(base, 'vite-dev-server/dist'), { recursive: true })
    writeFileSync(
      join(base, 'vite-dev-server/package.json'),
      JSON.stringify({ name: '@hono/vite-dev-server', version: '9.9.9', main: 'dist/index.js' }),
    )
    writeFileSync(join(base, 'vite-dev-server/dist/index.js'), '')
    writeFileSync(
      join(base, 'node-server/package.json'),
      JSON.stringify({
        name: '@hono/node-server',
        version: '8.8.8',
        main: 'dist/index.js',
        ...(pkg as object),
      }),
    )
    writeFileSync(join(base, 'node-server/dist/index.js'), '')
    for (const [name, text] of Object.entries(files))
      writeFileSync(join(base, 'node-server', name), text)
    return join(base, 'vite-dev-server/dist/index.js')
  }
  const lookup = (devServer: string) => devServerNodeServer(devServer)

  test('a working copy, as a control', async () => {
    const entry = fake(
      {
        type: 'module',
        exports: { '.': { require: './dist/index.js', import: './dist/index.js' } },
      },
      { 'dist/index.js': 'export const getRequestListener = () => 1' },
    )
    expect(typeof (await lookup(entry)).getRequestListener).toBe('function')
  })
  test('`exports` of another shape: the message names the package, the path and what to report', async () => {
    const entry = fake({ exports: { '.': { require: './dist/index.js' } } })
    const message = await lookup(entry).then(
      () => '',
      (e: Error) => e.message,
    )
    expect(message).toContain(
      "fondu: @hono/vite-dev-server's own @hono/node-server was not found as expected",
    )
    expect(message).toContain("exports['.'].import")
    expect(message).toContain(join('@hono', 'node-server', 'package.json'))
    expect(message).toContain('8.8.8')
    expect(message).toContain('Report it: https://github.com/fondujs/fondu/issues')
  })
  test('an entry that has no getRequestListener', async () => {
    const entry = fake(
      {
        type: 'module',
        exports: { '.': { require: './dist/index.js', import: './dist/index.js' } },
      },
      { 'dist/index.js': 'export const other = 1' },
    )
    await expect(lookup(entry)).rejects.toThrow('getRequestListener')
  })
  test('a dev server without @hono/node-server', async () => {
    const entry = fake({})
    rmSync(join(dir, 'node_modules/@hono/node-server'), { recursive: true })
    await expect(lookup(entry)).rejects.toThrow('it cannot be resolved')
  })
})
