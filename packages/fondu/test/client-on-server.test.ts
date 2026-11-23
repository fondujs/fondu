import { describe, expect, test } from 'vitest'

import { closeShallow, loadDocument, navigate, reload } from '../src/client.js'

describe('in the node environment', () => {
  test('there is no window, location or history', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof location).toBe('undefined')
    expect(typeof history).toBe('undefined')
  })

  test.each([
    ['navigate', () => navigate('/about')],
    ['navigate', () => navigate('/about', { shallow: true })],
    ['reload', () => reload()],
    ['loadDocument', () => loadDocument('/about')],
    ['closeShallow', () => closeShallow('/')],
  ])('%s() throws a fondu error', (name, call) => {
    expect(call).toThrow(new Error(`fondu: ${name}() runs in the browser, not on the server`))
  })

  test('an argument that is wrong too gets the same message first', () => {
    expect(() => navigate('javascript:alert(1)')).toThrow(
      'fondu: navigate() runs in the browser, not on the server',
    )
  })
})
