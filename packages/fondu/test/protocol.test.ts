import { createApp } from 'fondu'
import { createElement as h } from 'react'
// Fondu's protocol and the app conventions, on test/app/ with `app.request()`
import { afterEach, describe, expect, test, vi } from 'vitest'

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
    expect(res.headers.get('x-fondu-location')).toBe(`${ORIGIN}/`)
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
  test('Vary: X-Fondu on every answer (a page, a redirect, a 409)', async () => {
    const answers = [
      await app.request('/', { headers: html }),
      await app.request('/', { headers: fondu() }),
      await app.request('/redirect'),
      await app.request('/', { headers: fondu({ 'X-Fondu-Version': 'old' }) }),
    ]
    for (const res of answers) expect(res.headers.get('vary')).toBe('X-Fondu')
  })
  test('clearHistory(): the next page says so', async () => {
    const res = await app.request('/redirect?signout', {
      method: 'POST',
      headers: { ...fondu(), Origin: ORIGIN },
    })
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!
    const next = await page(await app.request('/', { headers: { ...fondu(), Cookie: cookie } }))
    expect(next.clearHistory).toBe(true)
    expect((await page(await app.request('/', { headers: fondu() }))).clearHistory).toBeUndefined()
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
    expect(api.status).toBe(200) // not a navigation: as it is
  })
  test('location(): 409 + X-Fondu-Location for a navigation, a redirect otherwise', async () => {
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
    ).toBe(302)
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
  })
  test('trailing slash: trimmed (Hono), the redirect stays on this site', async () => {
    const res = await app.request('/items/?x=1', { headers: html })
    expect([res.status, res.headers.get('location')]).toEqual([301, `${ORIGIN}/items?x=1`])
    expect(new URL((await app.request('//evil.com/')).headers.get('location')!).origin).toBe(ORIGIN)
  })
  test("trailing slash: 'append'", async () => {
    const appended = createApp({ trailingSlash: 'append' })
    expect((await appended.request('/boom', { headers: html })).headers.get('location')).toBe(
      `${ORIGIN}/boom/`,
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
