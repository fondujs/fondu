import { Hono } from 'hono'
// The routes/ conventions, form bodies, typed URLs.
import { describe, expect, test } from 'vitest'

import { href } from '../src/client.js'
import { fillPattern, isRouteFile, middlewareFor, routePatterns } from '../src/paths.js'
import { readBody } from '../src/server/validate.js'

describe('routes/ files', () => {
  test('file -> URL pattern', () => {
    expect(routePatterns('index.ts')).toEqual(['/'])
    expect(routePatterns('users/index.ts')).toEqual(['/users'])
    // a directory named index is a segment
    expect(routePatterns('index/detail.tsx')).toEqual(['/index/detail'])
    expect(routePatterns('search/index/results.tsx')).toEqual(['/search/index/results'])
    expect(routePatterns('index/index.tsx')).toEqual(['/index'])
    expect(routePatterns('users/[id].ts')).toEqual(['/users/:id'])
    expect(routePatterns('users/[id].tsx')).toEqual(['/users/:id']) // a page
    expect(routePatterns('docs/index.mdx')).toEqual(['/docs'])
    expect(routePatterns('docs/[...path].ts')).toEqual(['/docs/:path{.+}'])
    expect(routePatterns('(marketing)/about.ts')).toEqual(['/about'])
  })
  test('an optional segment: the URLs without it and with it', () => {
    expect(routePatterns('[[lang]]/about.ts')).toEqual(['/about', '/:lang/about'])
    expect(routePatterns('[[lang]]/index.ts')).toEqual(['/', '/:lang'])
    expect(routePatterns('blog/[[page]].ts')).toEqual(['/blog', '/blog/:page'])
    expect(routePatterns('[[lang]]/(shop)/items/[id].ts')).toEqual([
      '/items/:id',
      '/:lang/items/:id',
    ])
    expect(() => routePatterns('[[lang]]/[[page]].ts')).toThrow('2 optional segments; one at most')
    expect(() => routePatterns('docs/[[...path]].ts')).toThrow('an optional catch-all')
  })
  test('what is a route', () => {
    expect(isRouteFile('users/index.ts')).toBe(true)
    expect(isRouteFile('users/_middleware.ts')).toBe(false)
    expect(isRouteFile('users/-helpers.ts')).toBe(true) // only _ hides a file: every other one is a route
    expect(isRouteFile('users/_helpers.ts')).toBe(false)
    expect(isRouteFile('users/_parts/form.tsx')).toBe(false)
    expect(isRouteFile('users/index.test.ts')).toBe(false)
    expect(isRouteFile('users/form.tsx')).toBe(true) // a page
    expect(isRouteFile('docs/intro.mdx')).toBe(true)
    expect(isRouteFile('users/form.test.tsx')).toBe(false)
  })
  test('middleware applies to its directory and below, outermost first', () => {
    const files = ['_middleware.ts', 'users/_middleware.ts', 'admin/_middleware.ts']
    expect(middlewareFor('users/[id].ts', files)).toEqual([
      '_middleware.ts',
      'users/_middleware.ts',
    ])
    expect(middlewareFor('about.ts', files)).toEqual(['_middleware.ts'])
  })
  test('fillPattern: encoded, catch-all keeps slashes, never . / .. / empty', () => {
    expect(fillPattern('/users/:id', { id: 'a b' })).toBe('/users/a%20b')
    expect(fillPattern('/docs/:path{.+}', { path: 'a/b' })).toBe('/docs/a/b')
    for (const id of ['..', '.', ''])
      expect(() => fillPattern('/u/:id', { id })).toThrow('not a path segment')
    expect(() => fillPattern('/u/:id', {})).toThrow('missing param')
  })
})

describe('form bodies', () => {
  const read = async (body: string | FormData, type?: string) => {
    const app = new Hono().post('/', async (c) => c.json(await readBody(c as never)))
    return (
      await app.request('/', {
        method: 'POST',
        body,
        headers: type ? { 'Content-Type': type } : {},
      })
    ).json()
  }
  test('PHP-style names, as forms write nested fields and lists', async () => {
    expect(
      await read(
        'notify%5B%5D=email&notify%5B%5D=push&name=Ada',
        'application/x-www-form-urlencoded',
      ),
    ).toEqual({
      notify: ['email', 'push'],
      name: 'Ada',
    })
    const fd = new FormData()
    fd.append('notify[0]', 'email')
    fd.append('notify[1]', 'push')
    fd.append('user[name]', 'Ada')
    expect(await read(fd)).toEqual({ notify: ['email', 'push'], user: { name: 'Ada' } })
  })
  test('one value under one name stays a string; a repeated name becomes a list', async () => {
    expect(await read('a=1&b=2&b=3', 'application/x-www-form-urlencoded')).toEqual({
      a: '1',
      b: ['2', '3'],
    })
  })
  test('names that would change the object itself are ignored', async () => {
    const body = await read(
      '__proto__%5Bx%5D=1&constructor=y&a%5B__proto__%5D=2&name=Ada',
      'application/x-www-form-urlencoded',
    )
    expect(body).toEqual({ name: 'Ada' })
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
  test('names of what objects inherit are fields like others', async () => {
    const body = await read(
      'toString=1&hasOwnProperty%5Bx%5D=2',
      'application/x-www-form-urlencoded',
    )
    expect(body).toEqual({ toString: '1', hasOwnProperty: { x: '2' } })
    expect(
      (Object.prototype.hasOwnProperty as unknown as Record<string, unknown>).x,
    ).toBeUndefined()
  })
  test('a name given again is a list at any depth; [] goes after the highest index', async () => {
    const form = 'application/x-www-form-urlencoded'
    expect(await read('a%5Bb%5D=1&a%5Bb%5D=2', form)).toEqual({ a: { b: ['1', '2'] } })
    expect(await read('a%5B1%5D=x&a%5B%5D=y', form)).toEqual({ a: { 1: 'x', 2: 'y' } })
    expect(await read('a%5B%5D=x&a%5B5%5D=y&a%5B%5D=z', form)).toEqual({
      a: { 0: 'x', 5: 'y', 6: 'z' },
    })
  })
  test('many [] fields: read in linear time', async () => {
    const many = 'a%5B%5D=1&'.repeat(100_000)
    const started = performance.now()
    const body = (await read(many, 'application/x-www-form-urlencoded')) as { a: string[] }
    expect(body.a).toHaveLength(100_000)
    expect(performance.now() - started).toBeLessThan(3000)
  })
  test('JSON as it is, whatever the case of its type', async () => {
    expect(await read('{"a":[1]}', 'application/json')).toEqual({ a: [1] })
    expect(await read('{"a":[1]}', 'Application/JSON; charset=utf-8')).toEqual({ a: [1] })
  })
  test('a body that cannot be one object: 400', async () => {
    const status = async (body: string, type = 'application/x-www-form-urlencoded') => {
      const app = new Hono().post('/', async (c) => c.json(await readBody(c as never)))
      return (await app.request('/', { method: 'POST', body, headers: { 'Content-Type': type } }))
        .status
    }
    expect(await status('a=1&a%5Bb%5D=2')).toBe(400)
    expect(await status('a%5Bb%5D=2&a=1')).toBe(400)
    expect(await status(`a${'%5Bb%5D'.repeat(40)}=1`)).toBe(400)
    expect(await status(`a${'%5Bb%5D'.repeat(20)}=1`)).toBe(200)
    expect(await status('{"a":', 'application/json')).toBe(400)
    expect(await status('broken', 'multipart/form-data')).toBe(400)
    expect(await status('broken', 'multipart/form-data; boundary=test')).toBe(400)
  })
})

describe('href()', () => {
  // untyped here: no app's routes to check against
  const to = href as (path: string, params?: Record<string, number>) => string
  test('params filled, an action kept', () => {
    expect(to('/users/:id', { id: 7 })).toBe('/users/7')
    expect(to('/users/:id?delete', { id: 7 })).toBe('/users/7?delete')
    expect(to('/about')).toBe('/about')
  })
})
