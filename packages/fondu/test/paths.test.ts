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
    expect(routePatterns('users/[id].ts')).toEqual(['/users/:id'])
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
    expect(isRouteFile('users/-helpers.ts')).toBe(true) // no hidden rules: every .ts file is a route
    expect(isRouteFile('users/index.test.ts')).toBe(false)
    expect(isRouteFile('users/form.tsx')).toBe(false)
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
  test('JSON as it is', async () => {
    expect(await read('{"a":[1]}', 'application/json')).toEqual({ a: [1] })
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
