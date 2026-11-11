import { createApp, defer } from 'fondu'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { calls } from './app/routes/_deferred/calls.js'

// Deferred props (`defer()`): left out of a document and a navigation, asked for by a partial request
// (X-Fondu-Only, X-Fondu-Component), on test/app/routes/deferred.tsx with `app.request()`
const app = createApp()
const nav = (extra: Record<string, string> = {}) => ({
  'X-Fondu': 'true',
  'X-Fondu-Version': 'v1',
  ...extra,
})
const partial = (names: string, component = 'deferred', extra: Record<string, string> = {}) =>
  nav({ 'X-Fondu-Only': names, 'X-Fondu-Component': component, ...extra })
type Body = {
  props: Record<string, unknown>
  flash: Record<string, unknown>
  deferred?: string[]
}
const page = async (res: Response) => (await res.json()) as Body
const cookie = (flash: object) =>
  'fondu-flash=' + encodeURIComponent(JSON.stringify({ flash, errors: {} }))

beforeEach(() => Object.assign(calls, { stats: 0, feed: 0, shared: 0 }))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('deferred props', () => {
  test('a document: the deferred props are left out, and listed in the order given', async () => {
    const body = await (await app.request('/deferred', { headers: { Accept: 'text/html' } })).text()
    const data = JSON.parse(
      body
        .match(/<script data-page="app" type="application\/json">(.*?)<\/script>/)![1]!
        .replace(/\\\//g, '/'),
    )
    expect(data.props).toEqual({
      app: 'test',
      lazy: 'computed',
      counted: 1,
      title: 'Dashboard',
      errors: {},
    })
    expect(data.deferred).toEqual(['stats', 'feed'])
    expect(calls).toMatchObject({ stats: 0, feed: 0 })
  })
  test('a navigation: the deferred props are left out and listed; a page without any has no deferred', async () => {
    const res = await page(await app.request('/deferred', { headers: nav() }))
    expect(res.props.stats).toBeUndefined()
    expect(res.props.title).toBe('Dashboard')
    expect(res.deferred).toEqual(['stats', 'feed'])
    expect(calls).toMatchObject({ stats: 0, feed: 0 })
    expect('deferred' in (await page(await app.request('/', { headers: nav() })))).toBe(false)
  })
  test('a partial request: only the listed props (deferred ones evaluated, plain ones as given), no shared props, no errors, no deferred', async () => {
    const res = await app.request('/deferred?q=1', { headers: partial('stats,title,errors,app') })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-fondu')).toBe('true')
    expect(await page(res)).toEqual({
      component: 'deferred',
      props: { stats: { total: 3 }, title: 'Dashboard' },
      url: '/deferred?q=1',
      version: 'v1',
      flash: {},
    })
  })
  test('a partial request runs only the deferred functions it lists; a navigation runs none', async () => {
    await app.request('/deferred', { headers: nav() })
    expect(calls).toMatchObject({ stats: 0, feed: 0 })
    await app.request('/deferred', { headers: partial('feed') })
    expect(calls).toMatchObject({ stats: 0, feed: 1 })
    await app.request('/deferred', { headers: partial(' stats , feed,,') })
    expect(calls).toMatchObject({ stats: 1, feed: 2 })
  })
  test('a partial request keeps the flash cookie for the page that shows it', async () => {
    const Cookie = cookie({ message: 'hi' })
    const asked = await app.request('/deferred', {
      headers: partial('stats', 'deferred', { Cookie }),
    })
    expect(asked.headers.get('set-cookie')).toBeNull()
    expect((await page(asked)).flash).toEqual({})
    const shown = await app.request('/deferred', { headers: nav({ Cookie }) })
    expect((await page(shown)).flash).toEqual({ message: 'hi' })
    expect(shown.headers.get('set-cookie')).toContain('Max-Age=0')
  })
  test('a partial request does not evaluate the shared functions', async () => {
    await app.request('/deferred', { headers: partial('stats') })
    expect(calls.shared).toBe(0)
    await app.request('/deferred', { headers: nav() })
    expect(calls.shared).toBe(1)
  })
  test('a partial request for another component: the headers are ignored', async () => {
    const res = await page(await app.request('/deferred', { headers: partial('stats', 'index') }))
    expect(res.deferred).toEqual(['stats', 'feed'])
    expect(res.props.stats).toBeUndefined()
    expect(calls.stats).toBe(0)
  })
  test('a partial request of a route that redirects: the redirect', async () => {
    const res = await app.request('/redirect', { headers: partial('x', 'redirect') })
    expect([res.status, res.headers.get('location')]).toEqual([302, '/'])
  })
  test('a partial request is a GET only: HEAD runs no deferred function', async () => {
    const res = await app.request('/deferred', { method: 'HEAD', headers: partial('stats') })
    expect(res.status).toBe(200)
    expect(calls.stats).toBe(0)
  })
  test('a deferred function that throws: logged, left out, the others sent, status 200', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/deferred?fail', { headers: partial('stats,feed') })
    expect(res.status).toBe(200)
    expect((await page(res)).props).toEqual({ stats: { total: 3 } })
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]![0]).toBe('[fondu] the deferred prop "feed" of "deferred" failed:')
    expect(String(error.mock.calls[0]![1])).toContain('the feed is down')
  })
  test('prerendering: the deferred props are in props, no deferred', async () => {
    vi.stubEnv('FONDU_PRERENDER', '1')
    const res = await page(await app.request('/deferred', { headers: nav() }))
    expect(res.props).toMatchObject({ title: 'Dashboard', stats: { total: 3 }, feed: ['a'] })
    expect('deferred' in res).toBe(false)
  })
  test('prerendering: a deferred function that throws fails the page', async () => {
    vi.stubEnv('FONDU_PRERENDER', '1')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/deferred?fail', { headers: nav() })
    expect(res.status).toBe(500)
    expect(error.mock.calls.flat().join(' ')).toContain('the feed is down')
  })
  test('X-Fondu-Only with a name the page does not have, a shared prop, or errors: ignored', async () => {
    const res = await page(
      await app.request('/deferred', { headers: partial('nope,app,lazy,errors,constructor') }),
    )
    expect(res.props).toEqual({})
    expect(calls).toMatchObject({ stats: 0, feed: 0, shared: 0 })
  })
  test('a partial request from another build: 409 and X-Fondu-Location, no function runs', async () => {
    const res = await app.request('/deferred', {
      headers: partial('stats', 'deferred', { 'X-Fondu-Version': 'old' }),
    })
    expect([res.status, res.headers.get('x-fondu-location')]).toEqual([
      409,
      'http://localhost/deferred',
    ])
    expect(calls.stats).toBe(0)
  })
  test('defer() in share() or inside a prop: an error that says where it goes', async () => {
    expect(() => JSON.stringify({ a: { b: defer(() => 1) } })).toThrow(
      'fondu: defer() is for a prop of render(), at the top (not in share(), not inside a prop)',
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/deferred?misuse', { headers: { Accept: 'text/html' } })
    expect(res.status).toBe(500)
    expect(await res.text()).toContain('defer() is for a prop of render()')
  })
})
