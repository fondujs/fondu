import { createApp } from 'fondu'
import { describe, expect, test, vi } from 'vitest'

// #181: what Fondu itself refuses (413 body limit, 403 CSRF) and the error page's shared props
const small = createApp({ bodyLimit: 100 })
const ORIGIN = 'http://localhost'
const form = { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' }
const big = 'a=' + 'b'.repeat(200)
const page = async (res: Response) =>
  (await res.json()) as { component: string; props: Record<string, unknown> }
const dataOf = (text: string) =>
  JSON.parse(
    text
      .match(/<script data-page="app" type="application\/json">(.*?)<\/script>/)![1]!
      .replace(/\\\//g, '/'),
  ) as { component: string; props: Record<string, unknown> }

describe('413: the error page has the shared props', () => {
  test('a document', async () => {
    const res = await small.request('/items', {
      method: 'POST',
      headers: { ...form, Accept: 'text/html' },
      body: big,
    })
    expect(res.status).toBe(413)
    expect(dataOf(await res.text())).toMatchObject({
      component: '_error',
      props: { status: 413, app: 'test', lazy: 'computed' },
    })
  })
  test('a navigation: its page object', async () => {
    const res = await small.request('/items', {
      method: 'POST',
      headers: { ...form, 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' },
      body: big,
    })
    expect(res.status).toBe(413)
    expect(await page(res)).toMatchObject({
      component: '_error',
      props: { status: 413, app: 'test' },
    })
  })
  test('the flash shown by the error page is cleared (once)', async () => {
    const cookie = 'fondu-flash=' + encodeURIComponent(JSON.stringify({ flash: { message: 'hi' } }))
    const res = await small.request('/items', {
      method: 'POST',
      headers: { ...form, Accept: 'text/html', Cookie: cookie },
      body: big,
    })
    expect(res.status).toBe(413)
    expect(res.headers.get('set-cookie') ?? '').toContain('fondu-flash=;')
  })
  test('Vary: the document and the page object differ', async () => {
    const res = await small.request('/items', {
      method: 'POST',
      headers: { ...form, Accept: 'text/html' },
      body: big,
    })
    expect(res.headers.get('vary')).toContain('X-Fondu')
  })
  test('an API client: still the status alone', async () => {
    const res = await small.request('/api/data', {
      method: 'POST',
      headers: { ...form, 'Content-Type': 'application/json' },
      body: big,
    })
    expect([res.status, await res.text()]).toEqual([413, ''])
  })
  test('a 404 URL with a big body is a 404: the limit is in the routes', async () => {
    const res = await small.request('/nope', {
      method: 'POST',
      headers: { ...form, Accept: 'text/html' },
      body: big,
    })
    expect(res.status).toBe(404)
  })
  test('over the limit by Content-Length: the body is not read', async () => {
    let pulled = false
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true
          controller.enqueue(new TextEncoder().encode(big))
          controller.close()
        },
      },
      { highWaterMark: 0 }, // no read ahead: `pull` runs only when something reads
    )
    const req = new Request(`${ORIGIN}/items`, {
      method: 'POST',
      headers: { ...form, 'Content-Length': '5000', Accept: 'text/html' },
      body,
      duplex: 'half',
    } as RequestInit)
    expect(req.headers.get('content-length')).toBe('5000')
    const res = await small.request(req)
    expect([res.status, pulled]).toEqual([413, false])
  })
})

describe('413: the limit is in each route, for the methods that take a body (#219)', () => {
  const guarded = { ...form, 'X-Auth': 'yes' }
  const asked = (method: string, path: string, headers: Record<string, string>, body = big) =>
    small.request(path, { method, headers, body })

  test('a GET or HEAD with a body over the limit is not refused (the limit is not in its chain)', async () => {
    for (const method of ['GET', 'HEAD']) {
      // `Request` has no GET with a body: a POST's, with the method of a GET (as Bun and Node can hand over)
      const req = new Request(`${ORIGIN}/notes`, {
        method: 'POST',
        headers: { Accept: 'text/html', 'Content-Length': '5000' },
        body: new ReadableStream<Uint8Array>(),
        duplex: 'half',
      } as RequestInit)
      Object.defineProperty(req, 'method', { value: method })
      expect((await small.request(req)).status).toBe(200)
    }
  })
  test('a directory middleware that refuses runs before the limit: 401 and a redirect, not 413', async () => {
    const refused = await asked('POST', '/guarded/note', form)
    expect([refused.status, await refused.text()]).toEqual([401, 'Unauthorized'])
    const login = await asked('POST', '/guarded/note', { ...form, 'X-Auth': 'login' })
    expect([login.status, login.headers.get('location')]).toEqual([303, '/login'])
    const page = await asked('POST', '/guarded/page', { ...form, Accept: 'text/html' })
    expect(page.status).toBe(401)
  })
  test('a page action over the limit: the 413 page, with the shared props, after the directory middleware', async () => {
    const res = await asked('POST', '/guarded/page', { ...guarded, Accept: 'text/html' })
    expect(res.status).toBe(413)
    expect(dataOf(await res.text())).toMatchObject({
      component: '_error',
      props: { status: 413, app: 'test' },
    })
    expect((await asked('POST', '/tasks?remove', { ...form, Accept: 'text/html' })).status).toBe(
      413,
    )
  })
  test('a page action within the limit runs', async () => {
    const res = await asked('POST', '/guarded/page', guarded, 'a=b')
    expect([res.status, await res.text()]).toEqual([200, 'done'])
  })
  test('a .ts route over the limit: 413 for POST, PUT, PATCH and DELETE', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await asked(method, '/guarded/note', guarded)
      expect([method, res.status]).toEqual([method, 413])
      const ok = await asked(method, '/guarded/note', guarded, 'a=b')
      expect([method, ok.status, await ok.text()]).toEqual([method, 200, '3'])
    }
  })
  test('a client that leaves mid-upload is not logged as a 500', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const gone = new AbortController()
    let reads = 0
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (reads++ === 0) return controller.enqueue(new TextEncoder().encode('a=b'))
          gone.abort() // the connection closes: the stream fails (Node: "terminated"/"aborted")
          controller.error(new TypeError('terminated'))
        },
      },
      { highWaterMark: 0 },
    )
    const req = new Request(`${ORIGIN}/guarded/note`, {
      method: 'POST',
      headers: guarded,
      body,
      duplex: 'half',
      signal: gone.signal,
    } as RequestInit)
    expect(req.headers.has('content-length')).toBe(false)
    const res = await small.request(req)
    expect(res.status).not.toBe(500)
    expect(await res.text()).toBe('')
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
  test('a body that fails while the client is still there is still a 500, logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.error(new TypeError('broken')),
    })
    const req = new Request(`${ORIGIN}/guarded/note`, {
      method: 'POST',
      headers: guarded,
      body,
      duplex: 'half',
    } as RequestInit)
    expect((await small.request(req)).status).toBe(500)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('403: CSRF', () => {
  const cross = {
    Origin: 'https://evil.example',
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  test("plain text, for a document and a navigation too (Hono's own 403 has its response: no error page)", async () => {
    for (const extra of [
      { Accept: 'text/html' },
      { 'X-Fondu': 'true', 'X-Fondu-Version': 'v1' },
    ] as Array<Record<string, string>>) {
      const res = await small.request('/items', {
        method: 'POST',
        headers: { ...cross, ...extra },
        body: 'name=x',
      })
      expect([res.status, await res.text()]).toEqual([403, 'Forbidden'])
    }
  })
})
