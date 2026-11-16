// The form fields as one object, the server's and the browser's (useForm) reading: the same code
import { Hono } from 'hono'
import { describe, expect, test, vi } from 'vitest'

import { fieldKey, formObject, issueErrors, MalformedForm } from '../src/form.js'
import { readBody } from '../src/server/validate.js'

describe('formObject()', () => {
  test('lists, nested fields, a name given again', () => {
    const fields = new URLSearchParams('tags[]=a&tags[]=c&user[email]=a@b&name=x&name=y')
    expect(formObject(fields)).toEqual({
      tags: ['a', 'c'],
      user: { email: 'a@b' },
      name: ['x', 'y'],
    })
  })
  test('fields that are no object: MalformedForm', () => {
    for (const fields of ['a=1&a[b]=2', 'a[b]=1&a=2', 'a=1&a=2&a[b]=3'])
      expect(() => formObject(new URLSearchParams(fields))).toThrow(MalformedForm)
  })
  test('many repeated fields: flat and nested values retain their order', () => {
    const values = Array.from({ length: 10_000 }, (_, i) => String(i))
    for (const key of ['a', 'a[b]']) {
      const body = formObject(values.map((v) => [key, v]))
      expect(key === 'a' ? body.a : (body.a as Record<string, unknown>).b).toEqual(values)
    }
  })
  test('repeated fields keep strings and files, including their order', () => {
    const file = new File(['hello'], 'hello.txt')
    const body = formObject([
      ['a', 'first'],
      ['a', file],
      ['a', 'last'],
    ])
    expect(body.a).toEqual(['first', file, 'last'])
    expect((body.a as unknown[])[1]).toBe(file)
  })
  test('an explicit repeated index and appended fields remain distinct', () => {
    expect(formObject(new URLSearchParams('a[0]=x&a[0]=y&a[]=z&a[]=w'))).toEqual({
      a: [['x', 'y'], 'z', 'w'],
    })
  })
})

describe('the number of fields is bounded (#220)', () => {
  const fields = (n: number, key = (i: number) => `f${i}`) =>
    Array.from({ length: n }, (_, i) => [key(i), String(i)] as [string, string])

  test('10,000 entries are read, 10,001 are a MalformedForm', () => {
    expect(Object.keys(formObject(fields(10_000)))).toHaveLength(10_000)
    expect(() => formObject(fields(10_001))).toThrow(MalformedForm)
    // repeated names count too
    expect(() => formObject(fields(10_001, () => 'a'))).toThrow(MalformedForm)
  })
  test('files and empty file inputs count', () => {
    const empty = new File([], '')
    const file = new File(['x'], 'x.txt')
    const many = (entry: File) =>
      Array.from({ length: 10_001 }, () => ['f', entry] as [string, File])
    expect(() => formObject(many(empty))).toThrow(MalformedForm)
    expect(() => formObject(many(file))).toThrow(MalformedForm)
    // 10,000 empty file inputs are left out, as before
    expect(formObject(many(empty).slice(1))).toEqual({})
  })
  test('over HTTP: 10,000 fields are 200, 10,001 are a 400 (URL-encoded and multipart)', async () => {
    const app = new Hono().post('/', async (c) =>
      c.json(Object.keys((await readBody(c)) as object).length),
    )
    for (const multipart of [false, true])
      for (const [n, status] of [
        [10_000, 200],
        [10_001, 400],
      ] as const) {
        const body = multipart ? new FormData() : new URLSearchParams()
        for (let i = 0; i < n; i++) body.append(`f${i}`, 'x')
        const res = await app.request('/', { method: 'POST', body })
        expect([multipart, n, res.status]).toEqual([multipart, n, status])
        if (status === 400) expect(await res.text()).toContain('Malformed request body')
      }
  })
  test('a name nested too deep is refused without splitting all of it', () => {
    // 32 levels are read, 33 are not
    expect(formObject([[`a${'[b]'.repeat(31)}`, 'x']])).toBeTruthy()
    expect(() => formObject([[`a${'[b]'.repeat(32)}`, 'x']])).toThrow(MalformedForm)
    // a huge name: the work is the depth's, not the name's
    const key = '['.repeat(20_000_000)
    const split = vi.spyOn(String.prototype, 'split')
    const start = performance.now()
    try {
      expect(() => formObject([[key, 'x']])).toThrow(MalformedForm)
      expect(performance.now() - start).toBeLessThan(500)
      // every split of the name has a limit
      expect(split.mock.calls.length).toBeGreaterThan(0)
      for (const [, limit] of split.mock.calls) expect(limit).toBeLessThanOrEqual(33)
    } finally {
      split.mockRestore()
    }
  })
})

describe('many repeated form fields over HTTP', () => {
  for (const multipart of [false, true])
    test(multipart ? 'multipart' : 'URL-encoded', async () => {
      const app = new Hono().post('/', async (c) => c.json(await readBody(c)))
      const values = Array.from({ length: 10_000 }, (_, i) => String(i))
      for (const key of ['a', 'a[b]']) {
        const body = multipart ? new FormData() : new URLSearchParams()
        for (const value of values) body.append(key, value)
        const response = await app.request('/', { method: 'POST', body })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(key === 'a' ? { a: values } : { a: { b: values } })
      }
    })
})

test("a field's key in the errors is its issues' path", () => {
  expect(fieldKey('user[name]')).toBe('user.name')
  expect(fieldKey('tags[]')).toBe('tags')
  expect(fieldKey('email')).toBe('email')
  const errors = issueErrors([
    { message: 'first', path: ['user', { key: 'name' }] },
    { message: 'second', path: ['user', 'name'] },
    { message: 'form' },
  ])
  expect({ ...errors }).toEqual({ 'user.name': 'first', '': 'form' })
})
