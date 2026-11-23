import { describe, expect, test } from 'vitest'

import fondu from '../src/vite/index.js'

const make = (options?: unknown) => () => (fondu as (o?: unknown) => unknown)(options)

describe('fondu() options', () => {
  test('the valid ones', () => {
    for (const options of [
      { target: 'node' },
      { target: 'bun' },
      { target: 'cloudflare' },
      { target: 'node', ssr: false },
      { target: 'node', ssr: undefined, react: undefined, progress: undefined },
      { target: 'node', progress: false },
      { target: 'node', viewTransitions: true },
      { target: 'node', viewTransitions: false },
      { target: 'node', progress: { delay: 0, color: 'red', forms: false } },
      { target: 'node', react: {} },
      {
        target: 'node',
        react: { include: [/\.tsx$/, 'x'], jsxRuntime: 'classic', compiler: { x: 1 } },
      },
    ])
      expect(make(options), JSON.stringify(options)).not.toThrow()
  })

  test('none at all: the target is required', () => {
    expect(make()).toThrow(
      "fondu(): the options are required, at least `target`: 'node', 'bun' or 'cloudflare'",
    )
    expect(make(null)).toThrow('fondu(): the options are required')
    expect(make('node')).toThrow('fondu(): the options are an object')
    expect(make({})).toThrow("fondu(): `target` is required: 'node', 'bun' or 'cloudflare'")
  })

  test('target is one of three', () => {
    expect(make({ target: 'deno' })).toThrow(
      "fondu(): `target` must be 'node', 'bun' or 'cloudflare', not 'deno'",
    )
    expect(make({ target: 1 })).toThrow("`target` must be 'node', 'bun' or 'cloudflare', not 1")
    expect(make({ target: 'Node' })).toThrow("not 'Node'")
  })

  test('port is no option: it says to set PORT', () => {
    for (const target of ['node', 'bun', 'cloudflare'])
      expect(make({ target, port: 3000 }), target).toThrow(
        'fondu(): unknown option `port`. The options are target, ssr, react, progress, viewTransitions. There is no `port` option: the built server listens on the environment variable `PORT`, else 3000',
      )
    expect(make({ target: 'node', port: 3000, a: 1 })).toThrow('unknown options `port`, `a`')
    expect(make({ target: 'node', progress: { port: 1 } })).not.toThrow('PORT')
  })

  test('unknown keys', () => {
    expect(make({ target: 'node', prot: 3000 })).toThrow(
      'fondu(): unknown option `prot`. The options are target, ssr, react, progress',
    )
    expect(make({ target: 'node', a: 1, b: 2 })).toThrow('unknown options `a`, `b`')
  })

  test('ssr is a boolean', () => {
    expect(make({ target: 'node', ssr: 'no' })).toThrow('fondu(): `ssr` must be true or false')
  })

  test('prerender is no option: a route exports it', () => {
    for (const prerender of [true, false, 1])
      expect(make({ target: 'node', prerender })).toThrow(
        "fondu: the prerender option is gone: a route's export const prerender turns prerendering on",
      )
  })

  test('viewTransitions is a boolean', () => {
    for (const value of ['yes', 1, null, {}])
      expect(make({ target: 'node', viewTransitions: value })).toThrow(
        'fondu(): `viewTransitions` must be true or false',
      )
  })

  test('progress is false or its options', () => {
    expect(make({ target: 'node', progress: true })).toThrow(
      'fondu(): `progress` must be false or an object: delay, color, forms',
    )
    expect(make({ target: 'node', progress: null })).toThrow('`progress` must be false or')
    expect(make({ target: 'node', progress: [] })).toThrow('`progress` must be false or')
    expect(make({ target: 'node', progress: { delay: -1 } })).toThrow(
      'fondu(): `progress.delay` must be a number of milliseconds, 0 or more',
    )
    expect(make({ target: 'node', progress: { delay: '1' } })).toThrow('`progress.delay`')
    expect(make({ target: 'node', progress: { delay: NaN } })).toThrow('`progress.delay`')
    expect(make({ target: 'node', progress: { color: 1 } })).toThrow(
      'fondu(): `progress.color` must be a CSS color, a string',
    )
    expect(make({ target: 'node', progress: { forms: 'yes' } })).toThrow(
      'fondu(): `progress.forms` must be true or false',
    )
    expect(make({ target: 'node', progress: { colour: 'red' } })).toThrow(
      'fondu(): unknown option `progress.colour`. The options are delay, color, forms',
    )
  })

  test('react is the options of @vitejs/plugin-react', () => {
    expect(make({ target: 'node', react: true })).toThrow(
      'fondu(): `react` must be an object (the options of @vitejs/plugin-react)',
    )
    expect(make({ target: 'node', react: [] })).toThrow('`react` must be an object')
    expect(make({ target: 'node', react: { jsxRuntime: 'preact' } })).toThrow(
      "fondu(): `react.jsxRuntime` must be 'automatic' or 'classic'",
    )
    expect(make({ target: 'node', react: { jsxImportSource: 1 } })).toThrow(
      'fondu(): `react.jsxImportSource` must be a string',
    )
    expect(make({ target: 'node', react: { reactRefreshHost: 1 } })).toThrow(
      '`react.reactRefreshHost` must be a string',
    )
    expect(make({ target: 'node', react: { include: 1 } })).toThrow(
      'fondu(): `react.include` must be a string, a RegExp or an array of them',
    )
    expect(make({ target: 'node', react: { exclude: [1] } })).toThrow('`react.exclude` must be')
    expect(make({ target: 'node', react: { compiler: 'yes' } })).toThrow(
      'fondu(): `react.compiler` must be true, false or an object',
    )
  })
})
