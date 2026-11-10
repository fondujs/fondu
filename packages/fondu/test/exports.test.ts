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
      '(`actions`: a .ts file has one `POST`: a file per action, or a page’s route file (.tsx))',
    )
  })
  test('each offending export is named', () => {
    expect(() => checkExports('a.ts', { loader: handler, action: handler })).toThrow(
      /`loader`, `action`.*`loader`: in a \.ts file it is `GET`; `action`: in a \.ts file it is `POST`/,
    )
  })
  test('a .tsx file with GET: a page has loader', () => {
    expect(() => checkExports('a.tsx', { default: Page, GET: handler })).toThrow(
      'fondu: routes/a.tsx exports `GET`. It exports its page (default), loader, action or actions',
    )
  })
  test('a .ts file with GET and POST, a .tsx file with loader and action: accepted', () => {
    expect(() => checkExports('a.ts', { GET: handler, POST: handler })).not.toThrow()
    expect(() =>
      checkExports('a.tsx', { default: Page, loader: handler, action: handler }),
    ).not.toThrow()
  })
})
