// fetch() of fondu/client: the request it builds, the answer it reads, the errors it throws. The types are in
// types.test.ts; the registry there declares routes, so the call is loose here.
import { createApp } from 'fondu'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { fetch, FetchError } from '../src/client.js'

// oxlint-disable-next-line no-explicit-any -- what the stubbed answers are is checked per test
const call = fetch as unknown as (path: string, options?: Record<string, unknown>) => Promise<any>

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
const stub = (response: () => Response | Promise<Response>) => {
  const spy = vi.fn(async (..._: [string, RequestInit]) => response())
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => vi.stubGlobal('document', {}))
afterEach(() => vi.unstubAllGlobals())

describe('the request', () => {
  test('the URL from the pattern, its params and its query; GET without a body', async () => {
    const spy = stub(() => json({}))
    await call('/api/users/:id', {
      id: 7,
      query: { sort: 'name', tag: ['a', 'b'], skip: undefined },
    })
    const [url, init] = spy.mock.calls[0]!
    expect(url).toBe('/api/users/7?sort=name&tag=a&tag=b')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(Object.fromEntries(new Headers(init.headers))).toEqual({ accept: 'application/json' })
  })
  test('a param is encoded as href() encodes it', async () => {
    const spy = stub(() => json({}))
    await call('/api/users/:id', { id: 'a b/c' })
    expect(spy.mock.calls[0]![0]).toBe('/api/users/a%20b%2Fc')
  })
  test('the method, the JSON body and its content type', async () => {
    const spy = stub(() => json({ saved: true }))
    await call('/api/settings', { method: 'POST', body: { emails: false } })
    const [url, init] = spy.mock.calls[0]!
    expect(url).toBe('/api/settings')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"emails":false}')
    expect(Object.fromEntries(new Headers(init.headers))).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
    })
  })
  test('headers of the call add to (or replace) its own; the signal passes through', async () => {
    const spy = stub(() => json({}))
    const signal = new AbortController().signal
    await call('/api/usage', { headers: { 'X-Mode': 'x', Accept: 'text/plain' }, signal })
    const [, init] = spy.mock.calls[0]!
    expect(Object.fromEntries(new Headers(init.headers))).toEqual({
      accept: 'text/plain',
      'x-mode': 'x',
    })
    expect(init.signal).toBe(signal)
  })
  test('a body of false, 0 or an empty string is sent', async () => {
    const spy = stub(() => json({}))
    await call('/api/x', { method: 'PUT', body: false })
    await call('/api/x', { method: 'PUT', body: 0 })
    expect(spy.mock.calls.map(([, init]) => init.body)).toEqual(['false', '0'])
  })
})

describe('the answer', () => {
  test('JSON is parsed', async () => {
    stub(() => json({ used: 3, limit: 10 }))
    expect(await call('/api/usage')).toEqual({ used: 3, limit: 10 })
  })
  test('text for another content type', async () => {
    stub(() => new Response('hello', { headers: { 'Content-Type': 'text/plain' } }))
    expect(await call('/api/hello')).toBe('hello')
  })
  test('a 204, or an empty body, is undefined', async () => {
    stub(() => new Response(null, { status: 204 }))
    expect(await call('/api/x', { method: 'DELETE' })).toBeUndefined()
    stub(() => new Response('', { headers: { 'Content-Type': 'application/json' } }))
    expect(await call('/api/x')).toBeUndefined()
  })
  test('a 422 throws a FetchError with its status, its parsed body and the response', async () => {
    stub(() => json({ errors: { emails: 'Required' } }, { status: 422 }))
    const error = await call('/api/settings', { method: 'POST', body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(FetchError)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('POST /api/settings: 422')
    expect(error.status).toBe(422)
    expect(error.data).toEqual({ errors: { emails: 'Required' } })
    expect(error.response).toBeInstanceOf(Response)
  })
  test('an error that is not JSON: its text; a body that says JSON and is not: its text too', async () => {
    stub(() => new Response('Bad Gateway', { status: 502 }))
    expect(await call('/api/x').catch((e) => e.data)).toBe('Bad Gateway')
    stub(
      () =>
        new Response('<html>', { status: 500, headers: { 'Content-Type': 'application/json' } }),
    )
    expect(await call('/api/x').catch((e) => [e.status, e.data])).toEqual([500, '<html>'])
  })
  test('an error without a body: data is undefined', async () => {
    stub(() => new Response(null, { status: 404 }))
    await expect(call('/api/x')).rejects.toMatchObject({ status: 404, data: undefined })
  })
})

describe('failures', () => {
  test('a network error is thrown as it is', async () => {
    const failure = new TypeError('Failed to fetch')
    stub(() => Promise.reject(failure))
    await expect(call('/api/usage')).rejects.toBe(failure)
  })
  test('on the server (no document) it throws, and sends nothing', async () => {
    vi.unstubAllGlobals()
    const spy = stub(() => json({}))
    await expect(call('/api/usage')).rejects.toThrow(
      "fondu: fetch() from fondu/client is for the browser (effects, events); a page's data comes from its loader or defer()",
    )
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('against the app', () => {
  test('a POST its schema refuses is a 422 FetchError, then 200 once it is right', async () => {
    const app = createApp()
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      headers.set('Origin', 'http://localhost') // a browser sends it with a POST
      return app.request(url, { ...init, headers })
    })
    const refused = await call('/api/data', { method: 'POST', body: { n: 'x' } }).catch((e) => e)
    expect(refused).toBeInstanceOf(FetchError)
    expect(refused.status).toBe(422)
    expect(Object.keys(refused.data.errors)).toEqual(['n'])
    // the answer of the handler: its c.json(…, 201), parsed
    expect(await call('/api/data', { method: 'POST', body: { n: 3 } })).toEqual({ n: 3 })
    expect(await call('/api/data')).toEqual({ ok: true })
    const missing = await call('/api/data', { method: 'PUT' }).catch((e) => e)
    expect(missing.status).toBe(404)
  })
})
