import { createApp } from 'fondu'
import { describe, expect, test } from 'vitest'

const app = createApp()
const ORIGIN = 'http://localhost'
const send = (path: string, method: string, headers: Record<string, string> = {}) =>
  app.request(path, { method, headers: { Origin: ORIGIN, ...headers } })

describe('405', () => {
  test('a .ts route: DELETE lists its methods, HEAD with GET', async () => {
    const res = await send('/methods', 'DELETE')
    expect([res.status, res.headers.get('Allow')]).toEqual([405, 'GET, HEAD, POST, PUT'])
    expect(await res.text()).toBe('Method Not Allowed')
  })

  test('a page with a loader only: POST', async () => {
    const res = await send('/loader-only', 'POST')
    expect([res.status, res.headers.get('Allow')]).toEqual([405, 'GET, HEAD'])
  })

  test('HEAD and the methods it has still answer', async () => {
    expect((await send('/methods', 'HEAD')).status).toBe(200)
    expect(await (await send('/methods', 'PUT')).text()).toBe('put')
  })

  test('OPTIONS is not added to Allow, and is a 405 where the route has none', async () => {
    const res = await send('/methods', 'OPTIONS')
    expect([res.status, res.headers.get('Allow')]).toEqual([405, 'GET, HEAD, POST, PUT'])
  })

  test("a directory's cors() answers a preflight", async () => {
    const res = await send('/cors', 'OPTIONS', {
      Origin: 'https://app.example.com',
      'Access-Control-Request-Method': 'GET',
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(res.headers.get('Allow')).toBeNull()
    expect((await send('/cors', 'DELETE')).status).toBe(405)
  })

  test('a visitor gets the error page with status 405, a navigation too', async () => {
    const doc = await send('/loader-only', 'POST', { Accept: 'text/html' })
    expect(doc.status).toBe(405)
    expect(doc.headers.get('Allow')).toBe('GET, HEAD')
    expect(await doc.text()).toContain('"status":405')
    const nav = await send('/loader-only', 'POST', {
      Accept: 'text/html',
      'X-Fondu': 'true',
      'X-Fondu-Version': 'v1',
    })
    expect(nav.status).toBe(405)
    expect(nav.headers.get('Allow')).toBe('GET, HEAD')
    expect(await nav.json()).toMatchObject({ component: '_error', props: { status: 405 } })
  })

  test("a route another route's pattern answers is still that route's", async () => {
    const res = await send('/shadow/new', 'DELETE')
    expect([res.status, await res.text()]).toEqual([200, 'deleted new'])
    expect((await send('/shadow/new', 'PUT')).status).toBe(405)
  })

  test('an unknown ?action name on a page with actions is a 404', async () => {
    const res = await send('/tasks?nope', 'POST')
    expect(res.status).toBe(404)
    expect(res.headers.get('Allow')).toBeNull()
  })

  test('a single action ignores ?name', async () => {
    const res = await send('/single?other', 'POST')
    expect([res.status, await res.text()]).toEqual([200, 'acted'])
  })

  test('a URL that matches no route is a 404', async () => {
    const res = await send('/no/such/route', 'DELETE')
    expect([res.status, res.headers.get('Allow')]).toEqual([404, null])
  })
})
