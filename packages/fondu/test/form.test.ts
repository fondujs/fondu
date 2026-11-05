// The form fields as one object, the server's and the browser's (useForm) reading: the same code
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'

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
    const values = Array.from({ length: 100_000 }, (_, i) => String(i))
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

describe('many repeated form fields over HTTP', () => {
  for (const multipart of [false, true])
    test(multipart ? 'multipart' : 'URL-encoded', async () => {
      const app = new Hono().post('/', async (c) => c.json(await readBody(c)))
      const values = Array.from({ length: 16_000 }, (_, i) => String(i))
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
