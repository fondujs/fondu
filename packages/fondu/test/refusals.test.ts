import { createApp } from 'fondu'
import { describe, expect, test } from 'vitest'

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
  test('a 404 URL with a big body is a 413 too (the limit is for every request)', async () => {
    const res = await small.request('/nope', {
      method: 'POST',
      headers: { ...form, Accept: 'text/html' },
      body: big,
    })
    expect(res.status).toBe(413)
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
