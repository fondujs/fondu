// The server the prerender starts (Node / Bun): it fails in bounded time, and no child is left behind.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { nodeServer, prerender } from '../src/vite/prerender.js'

const logger = { error() {}, warn() {}, info() {} } as never
const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** an app root whose dist/server/index.js is this fake server (it writes its pid to `pid`) */
const fake = (script: string) => {
  const root = mkdtempSync(join(tmpdir(), 'fondu-child-'))
  roots.push(root)
  mkdirSync(join(root, 'dist/server'), { recursive: true })
  writeFileSync(
    join(root, 'dist/server/index.js'),
    `require('fs').writeFileSync('pid', String(process.pid))\n${script}`,
  )
  return root
}
const pidOf = (root: string) => Number(readFileSync(join(root, 'pid'), 'utf8'))
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const quick = { startup: 1500, request: 400 }
const failure = (run: Promise<unknown>) =>
  run.then(
    () => null,
    (error: Error) => error,
  )

// Observe the real fetch's deadline, not the runner's speed. A missing signal leaves the read hanging until the
// test's own timeout; a different cause of failure does not match this signal's reason.
const deadlineFailure = async (run: () => Promise<unknown>) => {
  const deadlines = vi.spyOn(AbortSignal, 'timeout')
  const requests = vi.spyOn(globalThis, 'fetch')
  const reading = run()
  const signal = requests.mock.calls[0]?.[1]?.signal
  expect(deadlines).toHaveBeenCalledExactlyOnceWith(quick.request)
  expect(signal).toBe(deadlines.mock.results[0]?.value)
  const error = await failure(reading)
  expect(error).toBeInstanceOf(Error)
  expect(['TimeoutError', 'AbortError']).toContain(error?.name)
  expect(signal?.aborted).toBe(true)
  expect(error).toBe(signal?.reason)
}

// a server that takes the connection and never answers
const mute = `require('net').createServer(() => {}).listen(process.env.PORT, '127.0.0.1')`
// answers the readiness request, then a page's headers and half its body, and no more
const stalls = `require('http').createServer((req, res) => {
  if (req.url === '/_fondu/prerender') return res.end('{"paths":["/x"],"problems":[],"version":null}')
  res.writeHead(200, { 'content-type': 'text/html' })
  res.write('<html>')
}).listen(process.env.PORT, '127.0.0.1')`

describe('the server of the prerender: a failed start', () => {
  test('a server that takes the connection and sends no headers: a deadline, and the child is stopped', async () => {
    const root = fake(mute)
    const error = await failure(nodeServer(root, 'node', quick)())
    expect(error?.message).toContain('did not start')
    expect(error?.message).toContain('no answer within')
    expect(alive(pidOf(root))).toBe(false)
  })
  test('a server that never listens: the same', async () => {
    const root = fake('setInterval(() => {}, 1000)')
    const error = await failure(nodeServer(root, 'node', quick)())
    expect(error?.message).toContain('no answer within')
    expect(alive(pidOf(root))).toBe(false)
  })
  test('a child that exits at once: its output is the error, fast', async () => {
    const root = fake(`console.error('boom: no config'); process.exit(3)`)
    const error = await failure(nodeServer(root, 'node', quick)())
    expect(error?.message).toContain('did not start')
    expect(error?.message).toContain('boom: no config')
    expect(error?.message).not.toContain('no answer within')
    expect(alive(pidOf(root))).toBe(false)
  })
  test('an executable that is not there: an error, not a crash of the build', async () => {
    const root = fake(mute)
    const error = await failure(nodeServer(root, 'fondu-no-such-runtime', quick)())
    expect(error?.message).toContain('did not start')
    expect(error?.message).toContain('ENOENT')
    expect(error?.message).not.toContain('no answer within')
  })
  test('through the build: it fails, naming the problem, and leaves no child', async () => {
    const root = fake(mute)
    await expect(
      prerender(nodeServer(root, 'node', quick), join(root, 'client'), logger, {
        serverDir: root,
      }),
    ).rejects.toThrow('prerendering failed')
    expect(alive(pidOf(root))).toBe(false)
  })
})

describe('the server of the prerender: a request that does not finish', () => {
  test('headers, and a body that never ends: the read fails by the deadline', async () => {
    const root = fake(stalls)
    const server = await nodeServer(root, 'node', quick)()
    try {
      await deadlineFailure(() => server.fetch('/x').then((res) => res.text()))
    } finally {
      await server.dispose()
    }
    expect(alive(pidOf(root))).toBe(false)
  })
  test('no headers at all: the request fails by the deadline', async () => {
    const root = fake(
      `require('http').createServer((req, res) => { if (req.url === '/_fondu/prerender') res.end('{}') }).listen(process.env.PORT, '127.0.0.1')`,
    )
    const server = await nodeServer(root, 'node', quick)()
    try {
      await deadlineFailure(() => server.fetch('/x'))
    } finally {
      await server.dispose()
    }
    expect(alive(pidOf(root))).toBe(false)
  })
  test('through the build: a page whose body stalls fails it, and the child is stopped', async () => {
    const root = fake(stalls)
    const error = await failure(
      prerender(nodeServer(root, 'node', quick), join(root, 'client'), logger, {
        serverDir: root,
      }),
    )
    expect(error?.message).toContain('prerendering failed')
    expect(alive(pidOf(root))).toBe(false)
  })
})
