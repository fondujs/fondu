import { describe, expect, test } from 'vitest'

import { checkExports } from '../src/server/app.js'

const handler = () => new Response('x')
const Page = () => null

describe('a route file has one spelling per handler', () => {
  test('a .ts file with loader: it is GET', () => {
    expect(() => checkExports('a.ts', { loader: handler })).toThrow(
      'fondu: routes/a.ts exports `loader`. It exports GET, POST, PUT, PATCH, DELETE, OPTIONS, prerender, params (`loader`: in a .ts file it is `GET`)',
    )
  })
  test('a .ts file with action: it is POST', () => {
    expect(() => checkExports('a.ts', { action: handler })).toThrow(
      '(`action`: in a .ts file it is `POST`)',
    )
  })
  test('a .ts file with actions: a file per action, or a page’s route file', () => {
    expect(() => checkExports('a.ts', { actions: { x: handler } })).toThrow(
      "(`actions`: a .ts file has one `POST`: a file per action, or a page's route file (.tsx))",
    )
  })
  test('each offending export is named', () => {
    expect(() => checkExports('a.ts', { loader: handler, action: handler })).toThrow(
      /`loader`, `action`.*`loader`: in a \.ts file it is `GET`; `action`: in a \.ts file it is `POST`/,
    )
  })
  test('an MDX page with prerender: put it in a .tsx route or a _middleware.ts', () => {
    expect(() => checkExports('a.mdx', { default: Page, prerender: true })).toThrow(
      "fondu: routes/a.mdx: an MDX page can't export prerender: put it in a .tsx route or a _middleware.ts",
    )
  })
  test('a .tsx file with GET: a page has loader', () => {
    expect(() => checkExports('a.tsx', { default: Page, GET: handler })).toThrow(
      'fondu: routes/a.tsx exports `GET`. It exports its page (default), loader, action or actions',
    )
  })
  test('layout chains were removed: a page, an MDX page and a _layout.tsx say what to use', () => {
    const message = (file: string) =>
      `fondu: routes/${file} exports layout: layout chains were removed in 0.21; use directory _layout.tsx files and route groups (see https://fondu.dev/docs/layouts)`
    for (const file of ['print.tsx', 'blog/post.mdx', 'blog/_layout.tsx'])
      for (const layout of [[], [Page], undefined])
        expect(() => checkExports(file, { default: Page, layout })).toThrow(message(file))
  })
  test('layout in a .ts file or _error.tsx is any other extra export', () => {
    expect(() => checkExports('a.ts', { layout: [] })).toThrow(
      'fondu: routes/a.ts exports `layout`',
    )
    expect(() => checkExports('_error.tsx', { default: Page, layout: [] })).toThrow(
      'fondu: routes/_error.tsx exports `layout`',
    )
  })
  test('a .ts file with GET and POST, a .tsx file with loader and action: accepted', () => {
    expect(() => checkExports('a.ts', { GET: handler, POST: handler })).not.toThrow()
    expect(() =>
      checkExports('a.tsx', { default: Page, loader: handler, action: handler }),
    ).not.toThrow()
  })
})

describe('the value of an export', () => {
  test('a handler is a function or a list of functions', () => {
    for (const [name, value, said] of [
      ['loader', 1, 'a number'],
      ['loader', 'x', 'a string'],
      ['loader', null, 'null'],
      ['loader', {}, 'object'],
      ['loader', [], 'a list'],
      ['loader', [handler, 1], 'a list'],
      ['action', true, 'boolean'],
    ] as const)
      expect(
        () => checkExports('x.tsx', { default: Page, [name]: value }),
        `${name} ${said}`,
      ).toThrow(/^fondu: routes\/x\.tsx: (?:loader|action) is a handler \(defineHandler\), not /)
    expect(() => checkExports('x.tsx', { default: Page, loader: 1 })).toThrow(
      'fondu: routes/x.tsx: loader is a handler (defineHandler), not number',
    )
    expect(() =>
      checkExports('x.tsx', { default: Page, loader: [handler, handler], action: handler }),
    ).not.toThrow()
    expect(() => checkExports('x.tsx', { default: Page, loader: undefined })).not.toThrow()
  })
  test('the HTTP methods of a .ts file', () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
      expect(() => checkExports('x.ts', { [method]: 'no' })).toThrow(
        `fondu: routes/x.ts: ${method} is a handler (defineHandler), not string`,
      )
  })
  test('actions is an object of handlers', () => {
    expect(() => checkExports('x.tsx', { default: Page, actions: { a: handler } })).not.toThrow()
    expect(() => checkExports('x.tsx', { default: Page, actions: { a: handler, b: 2 } })).toThrow(
      'fondu: routes/x.tsx: actions.b is a handler (defineHandler), not number',
    )
    for (const actions of [1, null, [handler], handler])
      expect(() => checkExports('x.tsx', { default: Page, actions })).toThrow(
        /^fondu: routes\/x\.tsx: actions is an object of handlers/,
      )
  })
  test('an actions entry that is undefined fails, naming the key; a top-level export that is undefined stays', () => {
    expect(() =>
      checkExports('x.tsx', { default: Page, actions: { a: handler, save: undefined } }),
    ).toThrow('fondu: routes/x.tsx: actions.save is a handler (defineHandler), not undefined')
    expect(() =>
      checkExports('x.tsx', {
        default: Page,
        loader: undefined,
        action: undefined,
        actions: undefined,
        prerender: undefined,
      }),
    ).not.toThrow()
  })
  test("a _middleware.ts's default is a middleware: a function, or a list of them", () => {
    for (const file of ['_middleware.ts', 'admin/_middleware.ts'])
      for (const [value, said] of [
        [1, 'number'],
        ['next', 'string'],
        [null, 'null'],
        [false, 'boolean'],
        [{}, 'object'],
        [[], 'a list'],
        [[handler, 1], 'a list'],
      ] as const)
        expect(() => checkExports(file, { default: value }), `${file} ${said}`).toThrow(
          `fondu: routes/${file}: default is a middleware, \`async (c, next) => …\`, not ${said}`,
        )
    for (const file of ['_middleware.ts', 'admin/_middleware.ts'])
      for (const mod of [
        { default: handler },
        { default: [handler, handler] },
        { default: undefined },
        { prerender: true },
        {},
      ])
        expect(() => checkExports(file, mod)).not.toThrow()
    // a route with `_middleware.ts` at the end of its name is a route
    expect(() => checkExports('my_middleware.ts', { GET: handler })).not.toThrow()
  })
  test('prerender is a boolean or a function, in a route and in a _middleware.ts', () => {
    for (const file of ['x.tsx', '_middleware.ts'])
      for (const prerender of ['yes', 1, null, {}, [{ id: 1 }]])
        expect(() =>
          checkExports(file, file === 'x.tsx' ? { default: Page, prerender } : { prerender }),
        ).toThrow(`fondu: routes/${file}: prerender is true, false or a function`)
    for (const prerender of [true, false, () => [], async () => []])
      expect(() => checkExports('x.tsx', { default: Page, prerender })).not.toThrow()
  })
})
