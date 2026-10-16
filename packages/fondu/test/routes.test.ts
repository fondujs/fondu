// The routes of app/routes/: their URLs for Hono, in order, and what fails at startup.
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'

import { routeTable, type RouteModule } from '../src/server/routes.js'

const page: RouteModule = { loader: (c) => c.text('page') }
const files = (...names: string[]) => Object.fromEntries(names.map((n) => [n, page]))
const table = (modules: Record<string, RouteModule>, append = false) =>
  routeTable(modules, append).map((r) => r.pattern)

describe('optional segments', () => {
  test('a file, two routes: the same middleware', () => {
    const routes = routeTable(
      {
        ...files('[[lang]]/about.ts'),
        '_middleware.ts': {},
        '[[lang]]/_middleware.ts': {},
      },
      false,
    )
    expect(routes).toEqual([
      {
        file: '[[lang]]/about.ts',
        path: '/about',
        pattern: '/about',
        middleware: ['[[lang]]/_middleware.ts'],
      },
      {
        file: '[[lang]]/about.ts',
        path: '/:lang/about',
        pattern: '/:lang/about',
        middleware: ['[[lang]]/_middleware.ts'],
      },
    ])
  })
})

describe('params: the values a param takes', () => {
  const lang = { params: { lang: ['de', 'zh-Hant'] } }
  test("Hono's own patterns, grouped and escaped", () => {
    expect(table({ ...files('[[lang]]/about.ts'), '[[lang]]/_middleware.ts': lang })).toEqual([
      '/about',
      '/:lang{(?:de|zh-Hant)}/about',
    ])
    expect(table({ 'docs/[v]/intro.ts': { ...page, params: { v: ['v1.2'] } } })).toEqual([
      '/docs/:v{(?:v1\\.2)}/intro',
    ])
  })
  test('the nearest file counts: the route, its directories, the root', () => {
    const modules = {
      '_middleware.ts': { params: { lang: ['de'] } },
      'shop/_middleware.ts': { params: { lang: ['fr'] } },
      'shop/[[lang]]/cart.ts': page,
      '[[lang]]/about.ts': page,
      'blog/[[lang]]/post.ts': { ...page, params: { lang: ['ja'] } },
    }
    expect(table(modules)).toEqual([
      '/about',
      '/blog/post',
      '/blog/:lang{(?:ja)}/post',
      '/shop/cart',
      '/shop/:lang{(?:fr)}/cart',
      '/:lang{(?:de)}/about',
    ])
  })
  test('order: static, then listed values, then any value, then a catch-all', () => {
    expect(
      table({
        ...files('[slug].ts', '[...rest].ts', 'about.ts', '[[lang]]/index.ts'),
        '[[lang]]/_middleware.ts': lang,
      }),
    ).toEqual(['/', '/about', '/:lang{(?:de|zh-Hant)}', '/:slug', '/:rest{.+}'])
  })
  test('in Hono: a listed value or another route, never part of a segment', async () => {
    const app = new Hono()
    const modules = {
      ...files('[[lang]]/index.ts', '[[lang]]/about.ts', '[slug].ts', '[slug]/about.ts'),
      '[[lang]]/_middleware.ts': lang,
    }
    for (const { file, pattern } of routeTable(modules, false))
      app.get(pattern, (c) => c.text(`${file} ${JSON.stringify(c.req.param())}`))
    const answer = async (path: string) => (await app.request(path)).text()
    expect(await answer('/de')).toBe('[[lang]]/index.ts {"lang":"de"}')
    expect(await answer('/zh-Hant/about')).toBe('[[lang]]/about.ts {"lang":"zh-Hant"}')
    expect(await answer('/about')).toBe('[[lang]]/about.ts {}')
    expect(await answer('/dex')).toBe('[slug].ts {"slug":"dex"}')
    expect(await answer('/xde')).toBe('[slug].ts {"slug":"xde"}')
    expect(await answer('/DE')).toBe('[slug].ts {"slug":"DE"}')
    expect(await answer('/zh/about')).toBe('[slug]/about.ts {"slug":"zh"}')
  })
  test('trailing slashes (append) for a listed param too, never for a catch-all', () => {
    expect(
      table(
        { ...files('[[lang]]/index.ts', 'docs/[...p].ts'), '[[lang]]/_middleware.ts': lang },
        true,
      ),
    ).toEqual(['/', '/docs/:p{.+}', '/:lang{(?:de|zh-Hant)}/'])
  })
  test('no values: the URLs without the segment only, and a route with none fails', () => {
    expect(
      table({ ...files('[[lang]]/about.ts'), '[[lang]]/_middleware.ts': { params: { lang: [] } } }),
    ).toEqual(['/about'])
    expect(() => table({ '[lang]/about.ts': { ...page, params: { lang: [] } } })).toThrow(
      'routes/[lang]/about.ts has no URL',
    )
  })
  test('a name no route takes fails: a typo would let any value in', () => {
    expect(() =>
      table({
        ...files('[[lang]]/about.ts'),
        '[[lang]]/_middleware.ts': { params: { lnag: ['de'] } },
      }),
    ).toThrow(
      'routes/[[lang]]/_middleware.ts exports params.lnag, but no route it applies to has [lnag] or [[lnag]]',
    )
  })
  test('values are URL segments: letters, digits and - . _ ~', () => {
    for (const bad of [
      ['de/x'],
      [''],
      ['.'],
      ['..'],
      ['a b'],
      ['{x}'],
      ['(?:x)'],
      ['é'],
      [1],
      'de',
    ])
      expect(() =>
        table({ '[lang]/about.ts': { ...page, params: { lang: bad as never } } }),
      ).toThrow('params.lang lists URL segments')
    expect(() => table({ '[lang]/about.ts': { ...page, params: ['de'] as never } })).toThrow(
      'params is an object',
    )
  })
  test('not for a catch-all', () => {
    expect(() => table({ 'docs/[...path].ts': { ...page, params: { path: ['a'] } } })).toThrow(
      'params.path lists the values of one segment, and routes/docs/[...path].ts has [...path]',
    )
  })
})

describe('one file per URL', () => {
  test('the same URL twice fails', () => {
    expect(() => table(files('index.ts', '[[lang]]/index.ts'))).toThrow(
      'routes/index.ts (/) and routes/[[lang]]/index.ts (/) answer the same URLs. One file per URL',
    )
    expect(() => table(files('about.ts', '(site)/about.ts'))).toThrow('answer the same URLs')
  })
  test('params named otherwise: the same URLs', () => {
    expect(() => table(files('users/[id].ts', 'users/[slug].ts'))).toThrow(
      'routes/users/[id].ts (/users/:id) and routes/users/[slug].ts (/users/:slug) answer the same URLs. Move one, or list the values of a param',
    )
    expect(() => table(files('[[lang]]/index.ts', '[slug].ts'))).toThrow('answer the same URLs')
  })
  test('listed values tell them apart', () => {
    expect(() =>
      table({
        ...files('[[lang]]/index.ts', '[slug].ts'),
        '[[lang]]/_middleware.ts': { params: { lang: ['de'] } },
      }),
    ).not.toThrow()
  })
  test('other methods in another file: still the same URL', () => {
    expect(() =>
      table({ 'a.ts': { GET: (c) => c.text('') }, '(forms)/a.ts': { POST: (c) => c.text('') } }),
    ).toThrow('answer the same URLs')
  })
})

describe('in the app', async () => {
  const { createApp } = await import('fondu')
  const app = createApp()
  const answer = async (path: string, a = app) => {
    const res = await a.request(path)
    return `${res.status} ${res.headers.get('x-lang')} ${await res.text()}`
  }
  test("both URLs run the directory's middleware", async () => {
    expect(await answer('/hello')).toBe('200 base hello ')
    expect(await answer('/de/hello')).toBe('200 de hello de')
    expect(await answer('/fr/hello')).toBe('200 fr hello fr')
  })
  test('another value is not a URL of the route', async () => {
    for (const path of ['/xx/hello', '/DE/hello', '/dex/hello', '/de-x/hello', '/de'])
      expect((await app.request(path)).status, path).toBe(404)
  })
  test('a percent-encoded value is the same URL (RFC 3986): the same route and middleware', async () => {
    expect(await answer('/%64e/hello')).toBe('200 de hello de')
  })
  test('trailing slashes', async () => {
    const trimmed = await app.request('/de/hello/')
    expect([trimmed.status, trimmed.headers.get('location')]).toEqual([
      301,
      'http://localhost/de/hello',
    ])
    const appended = createApp({ trailingSlash: 'append' })
    expect(await answer('/de/hello/', appended)).toBe('200 de hello de')
  })
})
