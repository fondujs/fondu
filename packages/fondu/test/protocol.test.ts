// The Inertia v3 protocol and the app conventions, on test/app/ with `app.request()`.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createApp } from 'fondu'

const app = createApp()
const ORIGIN = 'http://localhost'
const inertia = (extra: Record<string, string> = {}) => ({ 'X-Inertia': 'true', 'X-Inertia-Version': 'v1', ...extra })
const page = async (res: Response) => (await res.json()) as { component: string; props: Record<string, unknown>; [key: string]: unknown }
const partial = (data: string, extra: Record<string, string> = {}) => inertia({ 'X-Inertia-Partial-Component': 'home', 'X-Inertia-Partial-Data': data, ...extra })
const html = { Accept: 'text/html' }

afterEach(() => vi.unstubAllEnvs())

describe('pages', () => {
  test('a document: the page data in the HTML, props by kind, headers', async () => {
    const res = await app.request('/')
    const body = await res.text()
    const data = JSON.parse(body.match(/<script data-page="app" type="application\/json">(.*?)<\/script>/)![1]!.replace(/\\\//g, '/'))
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(data.component).toBe('home')
    expect(Object.keys(data.props).sort()).toEqual(['app', 'count', 'errors', 'fn', 'items', 'people', 'plain', 'plan', 'tree'])
    expect(data.deferredProps).toEqual({ default: ['stats', 'flaky'], slow: ['slow'] })
    expect(data.onceProps.plan).toEqual({ prop: 'plan', expiresAt: null })
    expect(data.mergeProps).toEqual(['items', 'people.data'])
    expect(data.matchPropsOn).toEqual(['items.id'])
    expect(data.deepMergeProps).toEqual(['tree'])
    expect(data.scrollProps).toEqual({ people: { pageName: 'page', currentPage: 1, previousPage: null, nextPage: 2, reset: false } })
    expect(data.sharedProps).toEqual(['app'])
    expect(res.headers.get('vary')).toContain('X-Inertia')
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(res.headers.get('referrer-policy')).toBe('same-origin')
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
})

describe('partial reloads', () => {
  test('only: the named props, always props and errors', async () => {
    expect(Object.keys((await page(await app.request('/', { headers: partial('fn') }))).props).sort()).toEqual(['count', 'errors', 'fn'])
  })
  test('except', async () => {
    const res = await app.request('/', { headers: inertia({ 'X-Inertia-Partial-Component': 'home', 'X-Inertia-Partial-Except': 'plain' }) })
    const props = (await page(res)).props
    expect(props).not.toHaveProperty('plain')
    expect(props).toHaveProperty('fn')
    expect(props).not.toHaveProperty('report') // optional: only when named
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
  test('merge: X-Inertia-Reset replaces instead', async () => {
    const res = await page(await app.request('/', { headers: partial('items', { 'X-Inertia-Reset': 'items' }) }))
    expect(res.mergeProps).toBeUndefined()
  })
  test('scroll: the previous page is prepended', async () => {
    const res = await page(await app.request('/', { headers: partial('people', { 'X-Inertia-Infinite-Scroll-Merge-Intent': 'prepend' }) }))
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
    expect((await app.request('/redirect', { method: 'PUT', headers: { ...inertia(), Origin: ORIGIN } })).status).toBe(303)
  })
  test('a redirect with a #fragment: 409 + X-Inertia-Redirect', async () => {
    const res = await app.request('/redirect?fragment', { method: 'POST', headers: { ...inertia(), Origin: ORIGIN } })
    expect(res.status).toBe(409)
    expect(res.headers.get('x-inertia-redirect')).toBe('/#target')
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
  test('CSRF: a cross-site form post is refused', async () => {
    const res = await app.request('/items', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=x' })
    expect(res.status).toBe(403)
  })
})

describe('withValidator', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('/items', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Referer: `${ORIGIN}/`, ...headers }, body: JSON.stringify(body) })
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
  test('an API client: 422 { errors }', async () => {
    const res = await app.request('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: '{"n":"x"}' })
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
    expect([valid.status, valid.headers.get('precognition-success'), valid.headers.get('set-cookie')]).toEqual([204, 'true', null]) // the action did not run
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
    expect(await page(await app.request('/forbidden', { headers: inertia() }))).toMatchObject({ props: { status: 403 } })
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
    expect(await page(await app.request('/boom', { headers: inertia() }))).toMatchObject({ component: 'error', props: { status: 500 } })
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
  const a = createApp({ document: ({ body }) => `<main id="a">${body}</main>` })
  const b = createApp({ document: ({ body }) => `<main id="b">${body}</main>` })
  expect(await (await a.request('/')).text()).toMatch(/^<main id="a">/)
  expect(await (await b.request('/')).text()).toMatch(/^<main id="b">/)
})
