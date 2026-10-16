import { createApp } from 'fondu'
import { createElement as h } from 'react'
// Inertia's protocol and the app conventions, on test/app/ with `app.request()`. Inertia's cases are answered as
// inertia-laravel answers them (CONTRIBUTING: Inertia's server side).
import { afterEach, describe, expect, test, vi } from 'vitest'

const app = createApp()
const ORIGIN = 'http://localhost'
const inertia = (extra: Record<string, string> = {}) => ({ 'X-Inertia': 'true', 'X-Inertia-Version': 'v1', ...extra })
const page = async (res: Response) =>
  (await res.json()) as { component: string; props: Record<string, unknown>; [key: string]: unknown }
const partial = (data: string, extra: Record<string, string> = {}) =>
  inertia({ 'X-Inertia-Partial-Component': 'home', 'X-Inertia-Partial-Data': data, ...extra })
const html = { Accept: 'text/html' }

afterEach(() => vi.unstubAllEnvs())

describe('pages', () => {
  test('a document: the page data in the HTML, props by kind, headers', async () => {
    const res = await app.request('/')
    const body = await res.text()
    const data = JSON.parse(
      body.match(/<script data-page="app" type="application\/json">(.*?)<\/script>/)![1]!.replace(/\\\//g, '/'),
    )
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(data.component).toBe('home')
    expect(Object.keys(data.props).sort()).toEqual([
      'app',
      'count',
      'errors',
      'fn',
      'items',
      'people',
      'plain',
      'plan',
      'tree',
    ])
    expect(data.deferredProps).toEqual({ default: ['stats', 'flaky'], slow: ['slow'] })
    expect(data.onceProps.plan).toEqual({ prop: 'plan', expiresAt: null })
    expect(data.mergeProps).toEqual(['items', 'people.data'])
    expect(data.matchPropsOn).toEqual(['items.id'])
    expect(data.deepMergeProps).toEqual(['tree'])
    expect(data.scrollProps).toEqual({
      people: { pageName: 'page', currentPage: 1, previousPage: null, nextPage: 2, reset: false },
    })
    expect(data.sharedProps).toEqual(['app'])
    expect(res.headers.get('vary')).toContain('X-Inertia')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(res.headers.get('referrer-policy')).toBe('same-origin')
  })
  test('a page in MDX: found like a .tsx one', async () => {
    expect(await page(await app.request('/notes', { headers: inertia() }))).toMatchObject({ component: 'notes' })
  })
  test('a visit: the page object as JSON', async () => {
    const res = await app.request('/', { headers: inertia() })
    expect(res.headers.get('x-inertia')).toBe('true')
    expect((await page(res)).props.plain).toBe('value')
  })
  test('a visit from other assets: 409, X-Inertia-Location, the current version', async () => {
    const res = await app.request('/', { headers: inertia({ 'X-Inertia-Version': 'old' }) })
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-location')).toBe(`${ORIGIN}/`)
    expect(res.headers.get('x-inertia-version')).toBe('v1')
  })
  test('other assets: not a 409 for a POST; the errors and flash wait for the reloaded page', async () => {
    const stale = inertia({ 'X-Inertia-Version': 'old' })
    const post = await app.request('/items', {
      method: 'POST',
      headers: { ...stale, 'Content-Type': 'application/json', Origin: ORIGIN, Referer: `${ORIGIN}/` },
      body: '{"name":"x"}',
    })
    expect(post.status).toBe(303)
    const cookie = post.headers.get('set-cookie')!.split(';')[0]!
    const reload = await app.request('/', { headers: { ...stale, Cookie: cookie } })
    expect([reload.status, reload.headers.get('set-cookie')]).toEqual([409, null])
    const next = await page(await app.request('/', { headers: { ...inertia(), Cookie: cookie } }))
    expect(next.props.errors).toEqual({ name: 'Too short' })
  })
  test('Vary: X-Inertia on every answer (a page, a redirect, a 409)', async () => {
    const answers = [
      await app.request('/', { headers: html }),
      await app.request('/', { headers: inertia() }),
      await app.request('/redirect'),
      await app.request('/', { headers: inertia({ 'X-Inertia-Version': 'old' }) }),
    ]
    for (const res of answers) expect(res.headers.get('vary')).toBe('X-Inertia')
  })
})

describe('partial reloads', () => {
  test('only: the named props, always props and errors', async () => {
    expect(Object.keys((await page(await app.request('/', { headers: partial('fn') }))).props).sort()).toEqual([
      'count',
      'errors',
      'fn',
    ])
  })
  test('except', async () => {
    const res = await app.request('/', {
      headers: inertia({ 'X-Inertia-Partial-Component': 'home', 'X-Inertia-Partial-Except': 'plain' }),
    })
    const props = (await page(res)).props
    expect(props).not.toHaveProperty('plain')
    expect(props).toHaveProperty('fn')
    expect(props).not.toHaveProperty('report') // optional: only when named in `only`, as Inertia's docs say
  })
  test("another page's partial reload: a visit to this one, every prop", async () => {
    const res = await page(
      await app.request('/', {
        headers: inertia({ 'X-Inertia-Partial-Component': 'other', 'X-Inertia-Partial-Data': 'fn' }),
      }),
    )
    expect(res.props).toHaveProperty('plain')
    expect(res.deferredProps).toBeDefined()
  })
  test('optional: computed when named', async () => {
    expect((await page(await app.request('/', { headers: partial('report') }))).props.report).toBe('report')
  })
  test('deferred: a group; a rescued failure is left out and listed', async () => {
    const res = await page(await app.request('/', { headers: partial('stats,flaky') }))
    expect(res.props.stats).toEqual({ n: 1 })
    expect(res.props).not.toHaveProperty('flaky')
    expect(res.rescuedProps).toEqual(['flaky'])
  })
  test('once: skipped when the client holds it, sent when fresh', async () => {
    const held = { 'X-Inertia-Except-Once-Props': 'plan' }
    expect((await page(await app.request('/', { headers: inertia(held) }))).props).not.toHaveProperty('plan')
    expect((await page(await app.request('/?fresh', { headers: inertia(held) }))).props.plan).toBe('plan')
  })
  test('once: a partial reload sends what it asks for, held or not, and lists only what it sends', async () => {
    const held = { 'X-Inertia-Except-Once-Props': 'plan' }
    const asked = await page(await app.request('/', { headers: partial('plan', held) }))
    expect([asked.props.plan, asked.onceProps]).toEqual(['plan', { plan: { prop: 'plan', expiresAt: null } }])
    const other = await page(await app.request('/', { headers: partial('fn', held) }))
    expect([other.props.plan, other.onceProps]).toEqual([undefined, undefined])
  })
  test('merge: X-Inertia-Reset replaces instead', async () => {
    const res = await page(await app.request('/', { headers: partial('items', { 'X-Inertia-Reset': 'items' }) }))
    expect(res.mergeProps).toBeUndefined()
  })
  test('merge: a partial reload lists the merged props it sends only', async () => {
    const res = await page(await app.request('/', { headers: partial('fn') }))
    expect([res.mergeProps, res.matchPropsOn, res.deepMergeProps]).toEqual([undefined, undefined, undefined])
  })
  test('scroll: the previous page is prepended', async () => {
    const res = await page(
      await app.request('/', { headers: partial('people', { 'X-Inertia-Infinite-Scroll-Merge-Intent': 'prepend' }) }),
    )
    expect(res.prependProps).toEqual(['people.data'])
  })
})

describe('routes', () => {
  test('actions: ?name picks one; unknown and built-in names are 404', async () => {
    const post = (q: string) => app.request(`/items?${q}`, { method: 'POST', headers: { Origin: ORIGIN } })
    expect(await (await post('remove')).text()).toBe('removed')
    expect((await post('nope')).status).toBe(404)
    expect((await post('constructor')).status).toBe(404)
  })
  test('a 302 after PUT is a 303 for Inertia', async () => {
    expect((await app.request('/redirect', { method: 'PUT', headers: { ...inertia(), Origin: ORIGIN } })).status).toBe(
      303,
    )
  })
  test('a redirect with a #fragment: 409 + X-Inertia-Redirect', async () => {
    const res = await app.request('/redirect?fragment', { method: 'POST', headers: { ...inertia(), Origin: ORIGIN } })
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-redirect')).toBe('/#target')
    const prefetch = await app.request('/redirect', { headers: inertia({ Purpose: 'prefetch' }) })
    expect([prefetch.status, prefetch.headers.get('location')]).toEqual([302, '/#target']) // not for a prefetch
  })
  test('an empty answer to a visit: back to the page', async () => {
    const res = await app.request('/redirect?nothing', {
      method: 'POST',
      headers: { ...inertia(), Origin: ORIGIN, Referer: `${ORIGIN}/items` },
    })
    expect([res.status, res.headers.get('location')]).toEqual([303, '/items'])
    const api = await app.request('/redirect?nothing', { method: 'POST', headers: { Origin: ORIGIN } })
    expect(api.status).toBe(200) // not a visit: as it is
  })
  test('location(): 409 + X-Inertia-Location for a visit, a redirect otherwise', async () => {
    const visit = await app.request('/redirect?away', { method: 'POST', headers: { ...inertia(), Origin: ORIGIN } })
    expect([visit.status, visit.headers.get('x-inertia-location')]).toEqual([409, 'https://example.com/'])
    expect((await app.request('/redirect?away', { method: 'POST', headers: { Origin: ORIGIN } })).status).toBe(302)
  })
  test('trailing slash: trimmed (Hono), the redirect stays on this site', async () => {
    const res = await app.request('/items/?x=1', { headers: html })
    expect([res.status, res.headers.get('location')]).toEqual([301, `${ORIGIN}/items?x=1`])
    expect(new URL((await app.request('//evil.com/')).headers.get('location')!).origin).toBe(ORIGIN)
  })
  test("trailing slash: 'append'", async () => {
    const appended = createApp({ trailingSlash: 'append' })
    expect((await appended.request('/boom', { headers: html })).headers.get('location')).toBe(`${ORIGIN}/boom/`)
    expect((await appended.request('/api/data/')).status).toBe(200)
  })
  test('CSP: the default, scripts with the nonce; a directive of yours replaces that one; false: none', async () => {
    expect((await app.request('/', { headers: html })).headers.get('content-security-policy')).toMatch(
      /script-src 'self' 'nonce-[\w+/=]+';/,
    )
    const fonts = createApp({ secureHeaders: { contentSecurityPolicy: { fontSrc: ['https://fonts.gstatic.com'] } } })
    const csp = (await fonts.request('/')).headers.get('content-security-policy')!
    expect([csp.includes('font-src https://fonts.gstatic.com'), csp.includes("object-src 'none'")]).toEqual([
      true,
      true,
    ])
    expect(
      (await createApp({ secureHeaders: { contentSecurityPolicy: false } }).request('/')).headers.get(
        'content-security-policy',
      ),
    ).toBeNull()
  })
  test('CSRF: a cross-site form post is refused', async () => {
    const res = await app.request('/items', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=x',
    })
    expect(res.status).toBe(403)
  })
})

describe('withValidator', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Referer: `${ORIGIN}/`, ...headers },
      body: JSON.stringify(body),
    })
  test('a page request with invalid input: 303 back, the errors in the flash cookie', async () => {
    const res = await post({ name: 'x' }, inertia())
    expect([res.status, res.headers.get('location')]).toEqual([303, '/'])
    expect(decodeURIComponent(res.headers.get('set-cookie')!)).toContain('"errors":{"name":"Too short"}')
  })
  test('an error bag', async () => {
    const res = await post({ name: 'x' }, inertia({ 'X-Inertia-Error-Bag': 'create' }))
    expect(decodeURIComponent(res.headers.get('set-cookie')!)).toContain('"errors":{"create":{"name":"Too short"}}')
  })
  test('the next page shows the errors and the flash once', async () => {
    const valid = await post({ name: 'Ada' }, inertia())
    const cookie = valid.headers.get('set-cookie')!.split(';')[0]!
    const next = await page(await app.request('/', { headers: { ...inertia(), Cookie: cookie } }))
    expect(next.flash).toEqual({ message: 'added Ada' })
  })
  test('a partial reload after the redirect (a form with `only`) gets the errors and the flash, once', async () => {
    const cookie = (res: Response) => res.headers.get('set-cookie')!.split(';')[0]!
    const invalid = cookie(await post({ name: 'x' }, inertia()))
    const next = await app.request('/', { headers: { ...partial('items'), Cookie: invalid } })
    expect((await page(next)).props.errors).toEqual({ name: 'Too short' })
    expect(next.headers.get('set-cookie')).toMatch(/fondu-flash=; Max-Age=0/)
    const valid = cookie(await post({ name: 'Ada' }, inertia()))
    expect((await page(await app.request('/', { headers: { ...partial('items'), Cookie: valid } }))).flash).toEqual({
      message: 'added Ada',
    })
    const bag = cookie(await post({ name: 'x' }, inertia({ 'X-Inertia-Error-Bag': 'create' })))
    expect(
      (await page(await app.request('/', { headers: { ...partial('items'), Cookie: bag } }))).props.errors,
    ).toEqual({
      create: { name: 'Too short' },
    })
  })
  test('a prefetch leaves them for the visit', async () => {
    const cookie = (await post({ name: 'x' }, inertia())).headers.get('set-cookie')!.split(';')[0]!
    const prefetch = await app.request('/', { headers: { ...inertia({ Purpose: 'prefetch' }), Cookie: cookie } })
    expect([(await page(prefetch)).props.errors, prefetch.headers.get('set-cookie')]).toEqual([{}, null])
    const visit = await page(await app.request('/', { headers: { ...inertia(), Cookie: cookie } }))
    expect(visit.props.errors).toEqual({ name: 'Too short' })
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
  test('Precognition: validation only — 422 with the asked fields, or 204', async () => {
    const pre = { Precognition: 'true' }
    const invalid = await post({ name: 'x', email: 'no' }, pre)
    expect([invalid.status, invalid.headers.get('precognition')]).toEqual([422, 'true'])
    expect(await invalid.json()).toEqual({ errors: { name: 'Too short', email: 'Bad email' } })
    const only = await post({ name: 'x', email: 'no' }, { ...pre, 'Precognition-Validate-Only': 'email' })
    expect(await only.json()).toEqual({ errors: { email: 'Bad email' } })
    const valid = await post({ name: 'Ada' }, pre)
    expect([valid.status, valid.headers.get('precognition-success'), valid.headers.get('set-cookie')]).toEqual([
      204,
      'true',
      null,
    ]) // the action did not run
  })
})

describe('errors', () => {
  test('404: the error page for a visit or a document, plain text for an API client', async () => {
    const visit = await app.request('/nope', { headers: inertia() })
    expect(visit.status).toBe(404)
    expect(await page(visit)).toMatchObject({ component: 'error', props: { status: 404, app: 'test' } })
    const doc = await app.request('/nope', { headers: html })
    expect([doc.status, (await doc.text()).includes('"component":"error"')]).toEqual([404, true])
    const api = await app.request('/nope')
    expect([api.status, await api.text()]).toEqual([404, 'Not Found'])
  })
  test('an HTTPException: its status on the error page', async () => {
    expect(await page(await app.request('/forbidden', { headers: inertia() }))).toMatchObject({
      props: { status: 403 },
    })
  })
  test('a thrown error in development: the report, also for a visit (Inertia shows it in its dialog)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/boom', { headers: inertia() })
    expect(res.status).toBe(500)
    expect(res.headers.get('x-inertia')).toBeNull()
    expect(await res.text()).toContain('the database is down')
  })
  test('a thrown error in production: the error page with status 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('DEV', false)
    expect(await page(await app.request('/boom', { headers: inertia() }))).toMatchObject({
      component: 'error',
      props: { status: 500 },
    })
  })
  test('a page that does not exist: said so, with the file to create', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await (await app.request('/missing', { headers: html })).text()).toContain('create app/pages/nope.tsx')
  })
  test('errorPage: false: plain text', async () => {
    expect(await (await createApp({ errorPage: false }).request('/nope', { headers: html })).text()).toBe('Not Found')
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
    expect(text).toContain(`<script src="/x.js"></script><script>1</script><script nonce="${nonce}">2</script>`)
  })
  test('head and body, each once', async () => {
    const app = createApp({ document: ({ body }) => `<html><body>${body}</body></html>` })
    expect((await app.request('/', { headers: html })).status).toBe(500)
  })
})

test('encryptHistory(): the pages of a directory encrypted in history; a route can opt out', async () => {
  const app = createApp()
  const visit = async (path: string) =>
    (await (await app.request(path, { headers: inertia() })).json()) as Record<string, unknown>
  expect((await visit('/private')).encryptHistory).toBe(true)
  expect((await visit('/private/open')).encryptHistory).toBeUndefined()
  expect((await visit('/')).encryptHistory).toBeUndefined()
})
