import { afterEach, expect, test, vi } from 'vitest'

import { check } from '../src/client/form.js'

const asyncSchema = (validate: () => Promise<{ issues?: never }>) => ({
  '~standard': { version: 1 as const, vendor: 'test', validate },
})

afterEach(() => vi.restoreAllMocks())

test('an async schema: no verdict and no throw, one warning for the schema however often it is checked', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const schema = asyncSchema(async () => ({}))
  for (let i = 0; i < 3; i++) expect(check(schema, () => ({ a: 'x' }))).toEqual({})
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(
    'fondu: this schema has an async rule, so useForm leaves it to the server; move the async rule into the action to check the rest in the browser',
  )
  check(
    asyncSchema(async () => ({})),
    () => ({}),
  )
  expect(warn).toHaveBeenCalledTimes(2)
})

test('an async schema that rejects: no unhandled rejection', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const unhandled = vi.fn()
  process.on('unhandledRejection', unhandled)
  const schema = asyncSchema(() => Promise.reject(new Error('the rule failed')))
  expect(check(schema, () => ({}))).toEqual({})
  await new Promise((resolve) => setTimeout(resolve, 20))
  process.off('unhandledRejection', unhandled)
  expect(unhandled).not.toHaveBeenCalled()
})

test('a sync schema still gives its issues', () => {
  const schema = {
    '~standard': {
      version: 1 as const,
      vendor: 'test',
      validate: () => ({ issues: [{ message: 'Required', path: ['name'] }] }),
    },
  }
  expect(check(schema, () => ({}))).toEqual({ name: 'Required' })
})
