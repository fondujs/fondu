import { createApp } from 'fondu'
import { describe, expect, test } from 'vitest'

const make = (options?: unknown) => () => (createApp as (o?: unknown) => unknown)(options)

describe('createApp() options', () => {
  test('the documented ones', () => {
    for (const options of [
      undefined,
      {},
      { document: () => '' },
      { trailingSlash: 'trim' },
      { trailingSlash: 'append' },
      { csrf: false },
      { csrf: { origin: 'https://example.com' } },
      { bodyLimit: 1000 },
      { bodyLimit: false },
      { secureHeaders: false },
      { secureHeaders: { contentSecurityPolicy: false } },
      { document: undefined, trailingSlash: undefined, bodyLimit: undefined },
    ])
      expect(make(options), JSON.stringify(options)).not.toThrow()
  })

  test('options is an object or none', () => {
    expect(make(null)).toThrow('fondu: createApp(): the options are an object')
    expect(make('x')).toThrow('fondu: createApp(): the options are an object')
    expect(make([])).toThrow('fondu: createApp(): the options are an object')
  })

  test('an unknown key', () => {
    expect(make({ bodylimit: 1 })).toThrow('fondu: createApp(): unknown option `bodylimit`')
    expect(make({ a: 1, b: 2 })).toThrow('unknown options `a`, `b`')
  })

  test('port has a hint', () => {
    expect(make({ port: 3000 })).toThrow(
      'There is no `port` option: the built server listens on the environment variable `PORT`',
    )
  })

  test('bodyLimit is a positive finite number, or false', () => {
    for (const v of ['10mb', 0, -1, NaN, Infinity, true, null])
      expect(make({ bodyLimit: v }), String(v)).toThrow(
        '`bodyLimit` must be a number of bytes above 0, or false',
      )
  })

  test("bodyLimit: '10mb' no longer turns the limit off", () => {
    expect(make({ bodyLimit: '10mb' })).toThrow('fondu: createApp()')
  })

  test('document is a function', () => {
    expect(make({ document: 'nope' })).toThrow(
      "`document` must be a function, ({ head, body }) => string, not 'nope'",
    )
  })

  test('trailingSlash is trim or append', () => {
    expect(make({ trailingSlash: 'bogus' })).toThrow(
      "`trailingSlash` must be 'trim' or 'append', not 'bogus'",
    )
  })

  test('csrf and secureHeaders are false or an object', () => {
    expect(make({ csrf: true })).toThrow('`csrf` must be false or an object')
    expect(make({ secureHeaders: 'yes' })).toThrow(
      "`secureHeaders` must be false or an object (the options of hono/secure-headers), not 'yes'",
    )
    expect(make({ csrf: [] })).toThrow('`csrf` must be false or an object')
  })
})
