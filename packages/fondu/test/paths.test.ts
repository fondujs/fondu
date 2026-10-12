import { Hono } from 'hono'
// The routes/ conventions, form bodies, typed URLs.
import { describe, expect, test } from 'vitest'

import { href } from '../src/client.js'
import { fillPattern, isRouteFile, middlewareFor, routePattern } from '../src/paths.js'
import { readBody } from '../src/server/validate.js'

describe('routes/ files', () => {
  test('file -> URL pattern', () => {
    expect(routePattern('index.ts')).toBe('/')
    expect(routePattern('users/index.ts')).toBe('/users')
    expect(routePattern('users/[id].ts')).toBe('/users/:id')
    expect(routePattern('docs/[...path].ts')).toBe('/docs/:path{.+}')
    expect(routePattern('(marketing)/about.ts')).toBe('/about')
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
    expect(middlewareFor('users/[id].ts', files)).toEqual(['_middleware.ts', 'users/_middleware.ts'])
    expect(middlewareFor('about.ts', files)).toEqual(['_middleware.ts'])
  })
  test('fillPattern: encoded, catch-all keeps slashes, never . / .. / empty', () => {
    expect(fillPattern('/users/:id', { id: 'a b' })).toBe('/users/a%20b')
    expect(fillPattern('/docs/:path{.+}', { path: 'a/b' })).toBe('/docs/a/b')
    for (const id of ['..', '.', '']) expect(() => fillPattern('/u/:id', { id })).toThrow('not a path segment')
    expect(() => fillPattern('/u/:id', {})).toThrow('missing param')
  })
})

describe('form bodies', () => {
  const read = async (body: string | FormData, type?: string) => {
    const app = new Hono().post('/', async (c) => c.json(await readBody(c as never)))
    return (await app.request('/', { method: 'POST', body, headers: type ? { 'Content-Type': type } : {} })).json()
  }
  test('PHP-style names, as Inertia sends files and as plain forms write lists', async () => {
    expect(await read('notify%5B%5D=email&notify%5B%5D=push&name=Ada', 'application/x-www-form-urlencoded')).toEqual({
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
    expect(await read('a=1&b=2&b=3', 'application/x-www-form-urlencoded')).toEqual({ a: '1', b: ['2', '3'] })
  })
  test('names that would change the object itself are ignored', async () => {
    const body = await read(
      '__proto__%5Bx%5D=1&constructor=y&a%5B__proto__%5D=2&name=Ada',
      'application/x-www-form-urlencoded',
    )
    expect(body).toEqual({ name: 'Ada' })
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
  test('JSON as it is', async () => {
    expect(await read('{"a":[1]}', 'application/json')).toEqual({ a: [1] })
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
