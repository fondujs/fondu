import { createApp, defineHandler, ValidationError } from 'fondu'
import { Hono } from 'hono'
import { createElement as h } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import * as z from 'zod/mini'

const app = createApp()
const ORIGIN = 'http://localhost'
const fondu = (extra: Record<string, string> = {}) => ({
  'X-Fondu': 'true',
  'X-Fondu-Version': 'v1',
  ...extra,
})
const page = async (res: Response) =>
  (await res.json()) as {
    component: string
    props: Record<string, unknown>
    [key: string]: unknown
  }
const html = { Accept: 'text/html' }

afterEach(() => vi.unstubAllEnvs())

describe('pages', () => {
  test('a document: the page data in the HTML, the shared props, headers', async () => {
    const res = await app.request('/')
    const body = await res.text()
    const data = JSON.parse(
      body
        .match(/<script data-page="app" type="application\/json">(.*?)<\/script>/)![1]!
        .replace(/\\\//g, '/'),
    )
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(data).toEqual({
      component: 'index',
      props: { app: 'test', lazy: 'computed', plain: 'value', errors: {} },
      url: '/',
      version: 'v1',
      flash: {},
    })
    expect(body).toMatch(
      /<script data-page="app" type="application\/json">.*<\/script><div id="app"><\/div>/,
    )
    expect(body).toMatch(/<div id="app"><\/div><script nonce="[^"]+">try\{var k=history\.state/)
    expect(res.headers.get('vary')).toContain('X-Fondu')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(res.headers.get('referrer-policy')).toBe('same-origin')
  })
  test('a page with no loader: a GET renders it, with the shared props', async () => {
    expect(await page(await app.request('/notes', { headers: fondu() }))).toMatchObject({
      component: 'notes',
      props: { app: 'test', errors: {} },
    })
  })
  test('a memo layout renders the page as its children on the server', async () => {
    const res = await app.request('/notes', { headers: html })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<section><h1>Notes</h1></section>')
  })
  test('render(): the page of its own route file only', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await (await app.request('/wrong', { headers: html })).text()).toContain(
      'render() renders the page of its own route file, routes/wrong',
    )
    expect(await (await app.request('/missing', { headers: html })).text()).toContain(
      'this route has none',
    )
  })
  test("another route's page as its own (its default export too): rendered under its own id", async () => {
    const res = await page(await app.request('/again', { headers: fondu() }))
    expect([res.component, res.props.plain]).toEqual(['again', 'again'])
    expect((await page(await app.request('/', { headers: fondu() }))).component).toBe('index')
  })
  test('a navigation: the page object as JSON', async () => {
    const res = await app.request('/', { headers: fondu() })
    expect(res.headers.get('x-fondu')).toBe('true')
    expect((await page(res)).props.plain).toBe('value')
  })
  test('a navigation from other assets: 409, X-Fondu-Location', async () => {
    const res = await app.request('/', { headers: fondu({ 'X-Fondu-Version': 'old' }) })
    expect(res.status).toBe(409)
    expect(res.headers.get('x-fondu-location')).toBe('/')
  })
  test('other assets: not a 409 for a POST; the errors and flash wait for the reloaded page', async () => {
    const stale = fondu({ 'X-Fondu-Version': 'old' })
    const post = await app.request('/items', {
      method: 'POST',
      headers: {
        ...stale,
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
      },
      body: '{"name":"x"}',
    })
    expect(post.status).toBe(303)
    const cookie = post.headers.get('set-cookie')!.split(';')[0]!
    const reload = await app.request('/', { headers: { ...stale, Cookie: cookie } })
    expect([reload.status, reload.headers.get('set-cookie')]).toEqual([409, null])
    const next = await page(await app.request('/', { headers: { ...fondu(), Cookie: cookie } }))
    expect(next.props.errors).toEqual({ name: 'Too short' })
  })
  test('Vary: a document varies on X-Fondu, a navigation on every header that selects its answer', async () => {
    const navigation = 'X-Fondu, X-Fondu-Version, X-Fondu-Only, X-Fondu-Component'
    const answers = [
      await app.request('/', { headers: html }),
      await app.request('/', { headers: fondu() }),
      await app.request('/redirect'),
      await app.request('/', { headers: fondu({ 'X-Fondu-Version': 'old' }) }),
    ]
    expect(answers.map((res) => res.headers.get('vary'))).toEqual([
      'X-Fondu',
      navigation,
      'X-Fondu',
      navigation,
    ])
  })
  test('Vary: a partial answer names X-Fondu-Component, as the full page of another component is not the same', async () => {
    const only = { 'X-Fondu-Only': 'stats' }
    const same = await app.request('/deferred', {
      headers: fondu({ ...only, 'X-Fondu-Component': 'deferred' }),
    })
    const other = await app.request('/deferred', {
      headers: fondu({ ...only, 'X-Fondu-Component': 'other' }),
    })
    expect(Object.keys((await page(same)).props)).toEqual(['stats'])
    expect(Object.keys((await page(other)).props)).not.toEqual(['stats'])
    for (const res of [same, other])
      expect(res.headers.get('vary')!.split(', ')).toContain('X-Fondu-Component')
  })
})

describe('routes', () => {
  test('actions: ?name picks one; unknown and built-in names, or none, are 404', async () => {
    const post = (q: string) =>
      app.request(`/tasks?${q}`, { method: 'POST', headers: { Origin: ORIGIN } })
    expect(await (await post('remove')).text()).toBe('removed')
    expect((await post('nope')).status).toBe(404)
    expect((await post('constructor')).status).toBe(404)
    expect(
      (await app.request('/tasks', { method: 'POST', headers: { Origin: ORIGIN } })).status,
    ).toBe(404)
  })
  test('an empty answer to a form: back to the page', async () => {
    const res = await app.request('/redirect?nothing', {
      method: 'POST',
      headers: { ...fondu(), Origin: ORIGIN, Referer: `${ORIGIN}/items` },
    })
    expect([res.status, res.headers.get('location')]).toEqual([303, '/items'])
    const api = await app.request('/redirect?nothing', {
      method: 'POST',
      headers: { Origin: ORIGIN },
    })
    expect(api.status).toBe(200)
  })
  test("a stream, to a navigation: answered at once (its body isn't read to tell if it is empty)", async () => {
    const res = await Promise.race([
      app.request('/redirect?events', { method: 'POST', headers: { ...fondu(), Origin: ORIGIN } }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ])
    expect(res?.headers.get('content-type')).toBe('text/event-stream')
    await res?.body?.cancel()
  })
  test('a redirect to another site: 409 + X-Fondu-Location for a navigation, as it is otherwise', async () => {
    const navigation = await app.request('/redirect?away', {
      method: 'POST',
      headers: { ...fondu(), Origin: ORIGIN },
    })
    expect([navigation.status, navigation.headers.get('x-fondu-location')]).toEqual([
      409,
      'https://example.com/',
    ])
    expect(
      (await app.request('/redirect?away', { method: 'POST', headers: { Origin: ORIGIN } })).status,
    ).toBe(303)
    const here = await app.request('/redirect?home', {
      method: 'POST',
      headers: { ...fondu(), Origin: ORIGIN },
    })
    expect([here.status, here.headers.get('location')]).toEqual([303, '/'])
  })
  test('a redirect to a #fragment: X-Fondu-Redirect for a navigation (fetch() loses it), as it is otherwise', async () => {
    const navigation = await app.request('/redirect?fragment', {
      method: 'POST',
      headers: { ...fondu(), Origin: ORIGIN },
    })
    expect([navigation.status, navigation.headers.get('x-fondu-redirect')]).toEqual([
      200,
      '/notes#end',
    ])
    const res = await app.request('/redirect?fragment', {
      method: 'POST',
      headers: { Origin: ORIGIN },
    })
    expect([res.status, res.headers.get('location')]).toEqual([303, '/notes#end'])
    // relative: resolved from the request's URL here (the client would from the page on the screen)
    const relative = await app.request('/redirect?relative', {
      method: 'POST',
      headers: { ...fondu(), Origin: ORIGIN, Referer: `${ORIGIN}/deep/page` },
    })
    expect(relative.headers.get('x-fondu-redirect')).toBe('/notes?a=1#end')
  })
  test('trailing slash: trimmed, the redirect is relative', async () => {
    const res = await app.request('/items/?x=1', { headers: html })
    expect([res.status, res.headers.get('location')]).toEqual([301, '/items?x=1'])
    expect((await app.request('//evil.com/')).headers.get('location')).toBe('/evil.com')
  })
  test("trailing slash: 'append'", async () => {
    const appended = createApp({ trailingSlash: 'append' })
    expect((await appended.request('/boom', { headers: html })).headers.get('location')).toBe(
      '/boom/',
    )
    expect((await appended.request('/api/data/')).status).toBe(200)
  })
  test('CSP: the default, scripts with the nonce; a directive of yours replaces that one; false: none', async () => {
    expect(
      (await app.request('/', { headers: html })).headers.get('content-security-policy'),
    ).toMatch(/script-src 'self' 'nonce-[\w+/=]+';/)
    const fonts = createApp({
      secureHeaders: { contentSecurityPolicy: { fontSrc: ['https://fonts.gstatic.com'] } },
    })
    const csp = (await fonts.request('/')).headers.get('content-security-policy')!
    expect([
      csp.includes('font-src https://fonts.gstatic.com'),
      csp.includes("object-src 'none'"),
    ]).toEqual([true, true])
    expect(
      (
        await createApp({ secureHeaders: { contentSecurityPolicy: false } }).request('/')
      ).headers.get('content-security-policy'),
    ).toBeNull()
  })
  test('CSRF: a cross-site form post is refused', async () => {
    const res = await app.request('/items', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'name=x',
    })
    expect(res.status).toBe(403)
  })
})

describe('behind a TLS-terminating proxy (Host: example.com, https in the browser, http here)', () => {
  const proxied = {
    Host: 'example.com',
    'X-Forwarded-Proto': 'https',
    Origin: 'https://example.com',
    Referer: 'https://example.com/items?x=1',
  }
  test('back(): the page the form was on, with or without Sec-Fetch-Site', async () => {
    for (const extra of [{ 'Sec-Fetch-Site': 'same-origin' }, {}] as Array<
      Record<string, string>
    >) {
      const res = await app.request('/redirect?nothing', {
        method: 'POST',
        headers: { ...fondu(), ...proxied, ...extra },
      })
      expect([res.status, res.headers.get('location')], JSON.stringify(extra)).toEqual([
        303,
        '/items?x=1',
      ])
    }
  })
  test('Sec-Fetch-Site: same-origin vouches for the Referer: only its path and query are used', async () => {
    const res = await app.request('/redirect?nothing', {
      method: 'POST',
      headers: {
        ...fondu(),
        'Sec-Fetch-Site': 'same-origin',
        Referer: 'https://other.example//deep/page?a=1',
      },
    })
    expect(res.headers.get('location')).toBe('/deep/page?a=1')
  })
  test('a validation failure: back to the page', async () => {
    const res = await app.request('/items', {
      method: 'POST',
      headers: { ...fondu(), ...proxied, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect([res.status, res.headers.get('location')]).toEqual([303, '/items?x=1'])
  })
  test('a redirect to this site, as the browser knows it: followed in place, not a document load', async () => {
    const res = await app.request('/redirect?absolute', {
      method: 'POST',
      headers: { ...fondu(), ...proxied },
    })
    expect([res.status, res.headers.get('location'), res.headers.get('x-fondu-location')]).toEqual([
      303,
      'https://example.com/notes',
      null,
    ])
    // another site is another site, whatever Sec-Fetch-Site says of the request
    const away = await app.request('/redirect?away', {
      method: 'POST',
      headers: { ...fondu(), Origin: ORIGIN, 'Sec-Fetch-Site': 'same-origin' },
    })
    expect([away.status, away.headers.get('x-fondu-location')]).toEqual([
      409,
      'https://example.com/',
    ])
  })
  test('the trailing-slash redirect is relative', async () => {
    const res = await app.request('/items/?x=1', { headers: { ...html, ...proxied } })
    expect([res.status, res.headers.get('location')]).toEqual([301, '/items?x=1'])
    const appended = createApp({ trailingSlash: 'append' })
    expect(
      (await appended.request('/boom?x=1', { headers: { ...html, ...proxied } })).headers.get(
        'location',
      ),
    ).toBe('/boom/?x=1')
  })
  test('X-Fondu-Location (a new build) is a path and query', async () => {
    const res = await app.request('/items?x=1', {
      headers: { ...fondu({ 'X-Fondu-Version': 'old' }), ...proxied },
    })
    expect([res.status, res.headers.get('x-fondu-location')]).toEqual([409, '/items?x=1'])
    const slashes = await app.request('//evil.com/path', {
      headers: fondu({ 'X-Fondu-Version': 'old' }),
    })
    expect(slashes.headers.get('x-fondu-location')).toBe('/evil.com/path')
  })
  test('CSRF: a form post with an https Origin passes without Sec-Fetch-Site; another site, the other port or scheme: 403', async () => {
    const post = (headers: Record<string, string>) =>
      app.request('/items', {
        method: 'POST',
        headers: {
          Host: 'example.com',
          'Content-Type': 'application/x-www-form-urlencoded',
          ...headers,
        },
        body: 'name=Ada',
      })
    expect((await post({ ...proxied })).status).toBe(303)
    expect((await post({ Origin: 'https://example.com' })).status).toBe(403) // https, but no proxy says so
    for (const origin of [
      'https://evil.example',
      'https://example.com:8443',
      'https://example.com.evil.example',
      'null',
    ])
      expect((await post({ ...proxied, Origin: origin })).status, origin).toBe(403)
    expect((await post({ 'X-Forwarded-Proto': 'https' })).status).toBe(403) // no Origin
    expect((await post({ 'Sec-Fetch-Site': 'same-origin' })).status).toBe(303)
    expect((await post({ ...proxied, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(303)
    expect(
      (await post({ 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' })).status,
    ).toBe(403)
  })
  test('CSRF: the origin option of an app replaces ours', async () => {
    const custom = createApp({ csrf: { origin: 'https://app.example' } })
    const post = (origin: string) =>
      custom.request('/items', {
        method: 'POST',
        headers: {
          ...proxied,
          Origin: origin,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name=Ada',
      })
    expect([
      (await post('https://app.example')).status,
      (await post('https://example.com')).status,
    ]).toEqual([303, 403])
  })
  test('the trailing-slash redirect never leaves this site', async () => {
    const appended = createApp({ trailingSlash: 'append' })
    // [asked, trimmed to, appended to (asked without its slash)]
    const cases = [
      ['//evil.com/', '/evil.com', '/evil.com/'],
      ['///evil.com/', '/evil.com', '/evil.com/'],
      ['/\\evil.com/', '/evil.com', '/evil.com/'],
      ['/%2Fevil.com/', '/%2Fevil.com', '/%2Fevil.com/'],
      ['/%5Cevil.com/', '/%5Cevil.com', '/%5Cevil.com/'],
      ['/%2f%2fevil.com/', '/%2f%2fevil.com', '/%2f%2fevil.com/'],
      [
        '//evil.com/?next=//other.example/',
        '/evil.com?next=//other.example/',
        '/evil.com/?next=//other.example/',
      ],
    ] as const
    for (const [asked, trimmed, withSlash] of cases) {
      for (const method of ['GET', 'HEAD']) {
        const res = await app.request(asked, { method, headers: html })
        expect([res.status, res.headers.get('location')], `${method} ${asked}`).toEqual([
          301,
          trimmed,
        ])
      }
      const without = asked.replace(/\/(?=\?|$)/, '')
      const res = await appended.request(without, { headers: html })
      expect([res.status, res.headers.get('location')], without).toEqual([301, withSlash])
      for (const location of [trimmed, withSlash])
        expect(new URL(location, ORIGIN).origin, location).toBe(ORIGIN)
    }
  })
  test('the trailing-slash redirect: the root and other methods as before', async () => {
    expect((await app.request('/', { headers: html })).status).toBe(200)
    expect(
      (await app.request('/items/', { method: 'POST', headers: { Origin: ORIGIN } })).status,
    ).toBe(404)
  })
})

describe('the flash cookie', () => {
  const cookieOf = (value: unknown) => 'fondu-flash=' + encodeURIComponent(JSON.stringify(value))
  const setCookie = (res: Response) => decodeURIComponent(res.headers.get('set-cookie') ?? '')
  const sent = (res: Response) =>
    JSON.parse(setCookie(res).match(/^fondu-flash=(.*?);/)![1]!) as {
      flash?: Record<string, string>
      errors?: Record<string, string>
    }
  const send = (body: unknown) =>
    app.request('/flashes', {
      method: 'POST',
      headers: {
        ...fondu(),
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        Referer: `${ORIGIN}/`,
      },
      body: JSON.stringify(body),
    })
  const big = 'x'.repeat(1500)
  const bytes = (res: Response) => encodeURIComponent(JSON.stringify(sent(res))).length

  test('a HEAD request neither shows nor clears the flash', async () => {
    const Cookie = cookieOf({ flash: { message: 'hi' } })
    for (const headers of [html, fondu()]) {
      const head = await app.request('/', { method: 'HEAD', headers: { ...headers, Cookie } })
      expect([head.status, head.headers.get('set-cookie')]).toEqual([200, null])
    }
    const shown = await page(await app.request('/', { headers: fondu({ Cookie }) }))
    expect(shown.flash).toEqual({ message: 'hi' })
  })
  test('a cookie that fits is sent whole', async () => {
    const res = await send({ flash: { message: 'hi' }, errors: { name: 'Too short' } })
    expect(sent(res)).toEqual({ flash: { message: 'hi' }, errors: { name: 'Too short' } })
  })
  test('over the limit: the flash data first, then the errors that fit, in their order; one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const flashOnly = await send({
      flash: { message: big + big + big },
      errors: { name: 'Too short' },
    })
    expect(sent(flashOnly)).toEqual({ errors: { name: 'Too short' } })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockClear()
    const errors = {
      a: 'first',
      b: 'b'.repeat(4500),
      c: 'third',
      d: 'd'.repeat(2500),
      e: 'e'.repeat(2500),
      f: 'last',
    }
    const res = await send({ flash: { message: 'hi' }, errors })
    expect(sent(res).flash).toBeUndefined()
    expect(Object.keys(sent(res).errors!)).toEqual(['a', 'c', 'd', 'f'])
    expect(bytes(res)).toBeLessThanOrEqual(4000)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })
  test('nothing fits: no cookie is sent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await send({ errors: { a: big + big + big } })
    expect(res.headers.get('set-cookie')).toBeNull()
  })
  test('a cookie of another shape is ignored: flash a plain object, errors strings', async () => {
    const bad: unknown[] = [
      [],
      'text',
      7,
      { flash: [] },
      { flash: 'x' },
      { flash: null },
      { errors: { name: null } },
      { errors: ['x'] },
      { flash: { ok: 'fine' }, errors: { name: 7 } },
    ]
    for (const value of bad) {
      const res = await app.request('/', { headers: fondu({ Cookie: cookieOf(value) }) })
      const shown = await page(res)
      expect(
        [shown.flash, (shown.props as { errors: object }).errors],
        JSON.stringify(value),
      ).toEqual([{}, {}])
    }
    const nested = {
      error: { title: 'Failed', description: 'Try again' },
      count: 3,
      list: [1, 'a'],
    }
    const kept = await page(
      await app.request('/', { headers: fondu({ Cookie: cookieOf({ flash: nested }) }) }),
    )
    expect(kept.flash).toEqual(nested)
    const good = await page(
      await app.request('/', {
        headers: fondu({ Cookie: cookieOf({ flash: { message: 'hi' }, errors: { name: 'Bad' } }) }),
      }),
    )
    expect([good.flash, (good.props as { errors: object }).errors]).toEqual([
      { message: 'hi' },
      { name: 'Bad' },
    ])
  })
})

describe('withValidator', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        Referer: `${ORIGIN}/`,
        ...headers,
      },
      body: JSON.stringify(body),
    })
  test('a page request with invalid input: 303 back, the errors in the flash cookie', async () => {
    const res = await post({ name: 'x' }, fondu())
    expect([res.status, res.headers.get('location')]).toEqual([303, '/'])
    expect(decodeURIComponent(res.headers.get('set-cookie')!)).toContain(
      '"errors":{"name":"Too short"}',
    )
  })
  test('the next page shows the errors and the flash once', async () => {
    const valid = await post({ name: 'Ada' }, fondu())
    const cookie = valid.headers.get('set-cookie')!.split(';')[0]!
    const next = await page(await app.request('/', { headers: { ...fondu(), Cookie: cookie } }))
    expect(next.flash).toEqual({ message: 'added Ada' })
  })
  test('an API client: 422 { errors }', async () => {
    const res = await app.request('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: '{"n":"x"}',
    })
    expect(res.status).toBe(422)
    expect(Object.keys(((await res.json()) as { errors: object }).errors)).toEqual(['n'])
  })
  test('a +json body type (application/merge-patch+json…) is read as JSON, as application/json is', async () => {
    for (const type of [
      'application/json',
      'application/merge-patch+json',
      'application/vnd.api+json; charset=utf-8',
      'Application/Merge-Patch+JSON',
    ]) {
      const res = await app.request('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': type, Origin: ORIGIN },
        body: '{"n":3}',
      })
      expect([res.status, await res.json()], type).toEqual([201, { n: 3 }])
    }
    // not JSON, and not a form: a body of it is a 415; with no body, there are no fields
    for (const type of ['text/plain', 'application/xml', 'text/foo+json']) {
      const res = await app.request('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': type, 'Content-Length': '7', Origin: ORIGIN },
        body: '{"n":3}',
      })
      expect(res.status, type).toBe(415)
      const empty = await app.request('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': type, Origin: ORIGIN },
      })
      expect(empty.status, type).toBe(422)
    }
    const bad = await app.request('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/merge-patch+json', Origin: ORIGIN },
      body: '{',
    })
    expect(bad.status).toBe(400)
  })
  test('a field named like what objects inherit: its error stops the handler like any other', async () => {
    for (const name of ['toString', 'constructor', 'hasOwnProperty']) {
      let ran = false
      const schema = z.object({ [name]: z.string().check(z.minLength(5)) })
      const handlers = defineHandler.withValidator({ body: schema })(
        (c) => ((ran = true), c.text('ran')),
      )
      const api = new Hono()
        .onError((error, c) => c.json((error as ValidationError).errors, 422))
        .post('/', ...(handlers as [never]))
      const res = await api.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [name]: 'x' }),
      })
      expect([ran, res.status, Object.keys(await res.json())]).toEqual([false, 422, [name]])
    }
  })
  test('params and query, typed after the schema; params that do not fit: 404', async () => {
    expect(await (await app.request('/users/7?full=1')).json()).toEqual({ id: 7, full: '1' })
    expect((await app.request('/users/x')).status).toBe(404)
  })
})

describe('errors', () => {
  test('404: the error page for a navigation or a document, plain text for an API client', async () => {
    const navigation = await app.request('/nope', { headers: fondu() })
    expect(navigation.status).toBe(404)
    expect(await page(navigation)).toMatchObject({
      component: '_error',
      props: { status: 404, app: 'test' },
    })
    const doc = await app.request('/nope', { headers: html })
    expect([doc.status, (await doc.text()).includes('"component":"_error"')]).toEqual([404, true])
    const api = await app.request('/nope')
    expect([api.status, await api.text()]).toEqual([404, 'Not Found'])
  })
  test('an HTTPException: its status on the error page', async () => {
    expect(await page(await app.request('/forbidden', { headers: fondu() }))).toMatchObject({
      props: { status: 403 },
    })
  })
  test('a thrown error in development: the report, also for a navigation (loaded as a document)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/boom', { headers: fondu() })
    expect(res.status).toBe(500)
    expect(res.headers.get('x-fondu')).toBeNull()
    expect(await res.text()).toContain('the database is down')
  })
  test('a thrown error in production: the error page with status 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('DEV', false)
    expect(await page(await app.request('/boom', { headers: fondu() }))).toMatchObject({
      component: '_error',
      props: { status: 500 },
    })
  })
})

describe('an error page that fails', () => {
  test('a document: plain text with the status (not sent to render in the browser), the failure logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/teapot', { headers: html })
    expect([res.status, await res.text()]).toEqual([418, 'Error'])
    expect(log.mock.calls.map(([m]) => String(m))).toContain(
      '[fondu] the error page failed to render:',
    )
  })
  test('any other error page renders: a thrown 500 in production is a document of the error page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('DEV', false)
    const res = await app.request('/boom', { headers: html })
    expect([res.status, (await res.text()).includes('"component":"_error"')]).toEqual([500, true])
  })
})

describe('the request body limit', () => {
  const small = createApp({ bodyLimit: 100 })
  const json = { 'Content-Type': 'application/json' }
  const body = (n: number) => JSON.stringify({ name: 'a'.repeat(n - 11) }) // n bytes: {"name":""} is 11
  const stream = (text: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    })
  const post = (a: Hono, text: string, headers: Record<string, string> = json) =>
    a.request('/items', { method: 'POST', headers: { Origin: ORIGIN, ...headers }, body: text })

  test('over the limit, an API client: 413, the handler does not run', async () => {
    const res = await post(small, body(101))
    expect([res.status, res.headers.get('location'), await res.text()]).toEqual([413, null, ''])
  })
  test('over the limit, with no Content-Length: counted as it is read, 413', async () => {
    const req = new Request(`${ORIGIN}/items`, {
      method: 'POST',
      headers: { Origin: ORIGIN, ...json },
      body: stream(body(101)),
      duplex: 'half',
    } as RequestInit)
    expect(req.headers.has('content-length')).toBe(false)
    const res = await small.request(req)
    expect([res.status, res.headers.get('location'), await res.text()]).toEqual([413, null, ''])
  })
  test('a stream within the limit reaches the handler, with its body', async () => {
    const req = new Request(`${ORIGIN}/items`, {
      method: 'POST',
      headers: { Origin: ORIGIN, ...json },
      body: stream(body(100)),
      duplex: 'half',
    } as RequestInit)
    expect((await small.request(req)).status).not.toBe(413)
  })
  test("over the limit, a visitor's form: the error page; a navigation: its page object", async () => {
    const form = {
      Origin: ORIGIN,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    const doc = await small.request('/tasks?remove', {
      method: 'POST',
      headers: { ...form, ...html },
      body: 'a=' + 'b'.repeat(100),
    })
    expect([doc.status, (await doc.text()).includes('"component":"_error"')]).toEqual([413, true])
    const navigation = await small.request('/tasks?remove', {
      method: 'POST',
      headers: { ...form, ...fondu() },
      body: 'a=' + 'b'.repeat(100),
    })
    expect(navigation.status).toBe(413)
    expect(await page(navigation)).toMatchObject({
      component: '_error',
      props: { status: 413 },
    })
  })
  test('exactly the limit: the handler answers', async () => {
    const res = await post(small, body(100))
    expect(res.status).not.toBe(413)
    expect(res.status).toBe(303)
  })
  test('no body: unaffected', async () => {
    expect((await small.request('/')).status).toBe(200)
    expect((await small.request('/items')).status).not.toBe(413)
  })
  test('bodyLimit: false: no limit', async () => {
    const res = await post(createApp({ bodyLimit: false }), body(101))
    expect(res.status).toBe(303)
  })
  test('the default: 10 MB', async () => {
    const MB = 10 * 1024 * 1024
    const over = await post(app, 'a'.repeat(MB + 1))
    expect(over.status).toBe(413)
    const at = await post(app, 'a'.repeat(MB))
    expect(at.status).not.toBe(413)
  })
})

test('each app keeps its own document', async () => {
  const a = createApp({ document: ({ head, body }) => `<main id="a">${head}${body}</main>` })
  const b = createApp({ document: ({ head, body }) => `<main id="b">${head}${body}</main>` })
  expect(await (await a.request('/')).text()).toMatch(/^<main id="a">/)
  expect(await (await b.request('/')).text()).toMatch(/^<main id="b">/)
})

describe('the document', () => {
  const THEME = "document.documentElement.className='dark'"
  test('JSX: rendered, the page where head and body are, its inline scripts with the nonce', async () => {
    const app = createApp({
      document: ({ head, body }) =>
        h(
          'html',
          { lang: 'fr' },
          h('head', null, h('script', { dangerouslySetInnerHTML: { __html: THEME } }), head),
          h('body', null, body),
        ),
    })
    const res = await app.request('/', { headers: html })
    const text = await res.text()
    const nonce = /'nonce-([\w+/=]+)'/.exec(res.headers.get('content-security-policy')!)![1]
    expect(text).toMatch(/^<!doctype html><html lang="fr"><head>/)
    expect(text).toContain(`<script nonce="${nonce}">${THEME}</script>`)
    expect(text).toMatch(/<\/head><body><script data-page="app"/)
    expect(text).not.toMatch(/fondu:document-(head|body)/)
  })
  test('JSX: the nonce is for the scripts the browser runs; a data block gets none (#268)', async () => {
    const LD = '{"@type":"WebSite","name":"x"}'
    const app = createApp({
      document: ({ head, body }) =>
        h(
          'html',
          null,
          h(
            'head',
            null,
            h('script', { dangerouslySetInnerHTML: { __html: THEME } }),
            h('script', { type: 'text/javascript', dangerouslySetInnerHTML: { __html: '1' } }),
            h('script', { type: 'module', dangerouslySetInnerHTML: { __html: '2' } }),
            h('script', { type: 'importmap', dangerouslySetInnerHTML: { __html: '{}' } }),
            h('script', { type: 'speculationrules', dangerouslySetInnerHTML: { __html: '{}' } }),
            h('script', { type: 'application/ld+json', dangerouslySetInnerHTML: { __html: LD } }),
            h('script', { type: 'application/json', dangerouslySetInnerHTML: { __html: '{}' } }),
            head,
          ),
          h('body', null, body),
        ),
    })
    const res = await app.request('/', { headers: html })
    const text = await res.text()
    const nonce = /'nonce-([\w+/=]+)'/.exec(res.headers.get('content-security-policy')!)![1]
    expect(text).toContain(`<script nonce="${nonce}">${THEME}</script>`)
    expect(text).toContain(`<script nonce="${nonce}" type="text/javascript">1</script>`)
    expect(text).toContain(`<script nonce="${nonce}" type="module">2</script>`)
    expect(text).toContain(`<script nonce="${nonce}" type="importmap">{}</script>`)
    expect(text).toContain(`<script nonce="${nonce}" type="speculationrules">{}</script>`)
    expect(text).toContain(
      `<script type="application/ld+json">${LD.replace(/</g, '\\u003c')}</script>`,
    )
    expect(text).toContain('<script type="application/json">{}</script>')
  })
  test('a string: taken as it is, its scripts given the nonce it writes', async () => {
    const app = createApp({
      document: ({ head, body, nonce }) =>
        `<!doctype html><html><head><script src="/x.js"></script><script>1</script><script nonce="${nonce}">2</script>${head}</head><body>${body}</body></html>`,
    })
    const res = await app.request('/', { headers: html })
    const text = await res.text()
    const nonce = /'nonce-([\w+/=]+)'/.exec(res.headers.get('content-security-policy')!)![1]
    expect(text).toContain(
      `<script src="/x.js"></script><script>1</script><script nonce="${nonce}">2</script>`,
    )
  })
  test('head and body, each once', async () => {
    const app = createApp({ document: ({ body }) => `<html><body>${body}</body></html>` })
    expect((await app.request('/', { headers: html })).status).toBe(500)
  })
})
