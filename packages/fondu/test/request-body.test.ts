import { spawnSync } from 'node:child_process'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { buildApp, startWorker, start, type BuiltApp } from './build-app.js'

// A request body is read whatever its headers say: HTTP/2 and HTTP/3 send one with neither Content-Length nor
// Transfer-Encoding, and `fetch` can make one. The app answers `/echo` with the body it read, and `/without-length`
// makes such a request inside the runtime (there is no such request in HTTP/1.1, so no client can send one over it).
const echo = `import { defineHandler } from 'fondu'
const any = { '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) } }
export const POST = defineHandler.withValidator({ body: any })((c, { body }) => c.json({ body }))
`
const server = `import { createApp } from 'fondu'
const app = createApp()
const handle = app.fetch.bind(app)
app.fetch = (request, ...rest) => {
  const url = new URL(request.url)
  if (url.pathname !== '/without-length') return handle(request, ...rest)
  const text = url.searchParams.get('text') ?? ''
  const body = new ReadableStream({
    start(controller) {
      if (text) controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
  const inner = new Request(new URL('/echo', request.url), {
    method: 'POST',
    headers: { 'Content-Type': url.searchParams.get('type') ?? 'text/plain', Origin: url.origin },
    body,
    duplex: 'half',
  })
  const framed = inner.headers.has('content-length') || inner.headers.has('transfer-encoding')
  return Promise.resolve(handle(inner, ...rest)).then((res) => {
    const out = new Response(res.body, res)
    out.headers.set('X-Framed', String(framed))
    return out
  })
}
export default app
`
const files = {
  'app/routes/index.tsx': 'export default function Home() { return <p>home</p> }\n',
  'app/routes/echo.ts': echo,
  'app/server.ts': server,
}

type Call = (path: string, init?: RequestInit) => Promise<Response>

const stream = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      if (text) controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })

// [what is sent, status, what the app read (415 and 400: none)]
function cases(
  call: Call,
  origin: string,
): Array<[string, () => Promise<Response>, number, unknown]> {
  const post = (type: string, init: RequestInit & { duplex?: 'half' } = {}) =>
    call('/echo', { method: 'POST', headers: { 'Content-Type': type, Origin: origin }, ...init })
  const bare = (text: string, type = 'text/plain') =>
    call(`/without-length?type=${encodeURIComponent(type)}&text=${encodeURIComponent(text)}`)
  return [
    ['no body', () => post('text/plain'), 200, { body: {} }],
    ['an empty body', () => post('text/plain', { body: '' }), 200, { body: {} }],
    [
      'an empty chunked body',
      () => post('text/plain', { body: stream(''), duplex: 'half' }),
      200,
      { body: {} },
    ],
    [
      'a chunked body of an unknown type',
      () => post('text/plain', { body: stream('hello'), duplex: 'half' }),
      415,
      undefined,
    ],
    [
      'a chunked JSON body',
      () => post('application/json', { body: stream('{"a":1}'), duplex: 'half' }),
      200,
      { body: { a: 1 } },
    ],
    ['an empty body without a length', () => bare(''), 200, { body: {} }],
    ['a body without a length, of an unknown type', () => bare('hello'), 415, undefined],
    [
      'a JSON body without a length',
      () => bare('{"a":1}', 'application/json'),
      200,
      { body: { a: 1 } },
    ],
    [
      'a form body without a length',
      () => bare('a=1&b=2', 'application/x-www-form-urlencoded'),
      200,
      { body: { a: '1', b: '2' } },
    ],
  ]
}

async function check(call: Call, origin: string) {
  for (const [name, send, status, read] of cases(call, origin)) {
    const res = await send()
    expect(res.status, name).toBe(status)
    if (read !== undefined) expect(await res.json(), name).toEqual(read)
    else await res.body?.cancel()
    if (name.includes('without a length')) expect(res.headers.get('x-framed'), name).toBe('false')
  }
}

const hasBun = spawnSync('bun', ['--version']).status === 0

describe('a request body is read whatever its headers say', { timeout: 120_000 }, () => {
  describe('Node', () => {
    let app: BuiltApp
    beforeAll(async () => {
      app = await buildApp(files)
    })
    afterAll(() => app?.remove())
    test('built server', async () => {
      const running = await start(app)
      try {
        await check((path, init) => fetch(running.url + path, init), running.url)
      } finally {
        await running.stop()
      }
    })
  })

  describe.skipIf(!hasBun)('Bun', () => {
    let app: BuiltApp
    beforeAll(async () => {
      app = await buildApp(files, { target: 'bun' })
    })
    afterAll(() => app?.remove())
    test('built server', async () => {
      const running = await start(app, {}, 'bun')
      try {
        await check((path, init) => fetch(running.url + path, init), running.url)
      } finally {
        await running.stop()
      }
    })
  })

  describe('Cloudflare Workers (workerd)', () => {
    let app: BuiltApp
    beforeAll(async () => {
      app = await buildApp(files, { target: 'cloudflare' })
    })
    afterAll(() => app?.remove())
    test('built Worker', async () => {
      const worker = await startWorker(app)
      try {
        await check(worker.fetch, 'http://localhost')
      } finally {
        await worker.stop()
      }
    })
  })
})
