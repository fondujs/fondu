// The form fields as one object, the server's and the browser's (useForm) reading: the same code
import { describe, expect, test } from 'vitest'

import { fieldKey, formObject, issueErrors, MalformedForm } from '../src/form.js'

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
    expect(() => formObject(new URLSearchParams('a=1&a[b]=2'))).toThrow(MalformedForm)
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
