// Properties, over generated inputs: the page objects' URLs (one for one with the pages'), and request bodies read
// as forms write them, whatever their names and values (never a 500, never the prototype changed)
import fc from 'fast-check'
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'

import { pageDataPath, pathOfPageData } from '../src/paths.js'
import { readBody } from '../src/server/validate.js'

// a URL path's segment as a browser writes it: unreserved characters as they are, others percent-encoded, and the
// names that mean something to the page objects' URLs (index, ~index…) often
const segment = fc.oneof(
  fc.constantFrom('index', '~index', '~~index', 'docs', 'a.b', '~', '_x'),
  fc.stringMatching(/^[A-Za-z0-9._~-]{1,8}$/),
  fc.string({ minLength: 1, maxLength: 6 }).map(encodeURIComponent),
)
const path = fc
  .tuple(fc.array(segment, { maxLength: 4 }), fc.boolean())
  .map(([parts, slash]) => (parts.length ? `/${parts.join('/')}${slash ? '/' : ''}` : '/'))

describe('page objects', () => {
  test("each page's URL, and back: the same path", () => {
    fc.assert(fc.property(path, (p) => pathOfPageData(pageDataPath(p)) === p))
  })
  test('two pages, two page objects (as the server reads them, decoded)', () => {
    const decoded = (p: string) =>
      p
        .split('/')
        .map((s) => decodeURIComponent(s))
        .join('/')
    fc.assert(
      fc.property(path, path, (a, b) => {
        fc.pre(decoded(a) !== decoded(b))
        return decoded(pageDataPath(a)) !== decoded(pageDataPath(b))
      }),
    )
  })
  test('a segment written encoded: the page object of the segment written as it is', () => {
    const literal = fc.constantFrom('index', '~index', 'docs')
    fc.assert(
      fc.property(fc.array(segment, { maxLength: 3 }), literal, (parts, last) => {
        const encoded = [...last].map((ch) => `%${ch.charCodeAt(0).toString(16)}`).join('')
        const dir = parts.length ? `/${parts.join('/')}` : ''
        return (
          decodeURIComponent(pageDataPath(`${dir}/${encoded}`)) ===
          decodeURIComponent(pageDataPath(`${dir}/${last}`))
        )
      }),
    )
  })
})

describe('form bodies', () => {
  const read = async (body: string | Uint8Array<ArrayBuffer>, type: string) => {
    const app = new Hono().post('/', async (c) => c.json(await readBody(c as never)))
    const res = await app.request('/', { method: 'POST', body, headers: { 'Content-Type': type } })
    return { status: res.status, body: res.status === 200 ? await res.json() : null }
  }
  // a field's name without brackets, and its value: anything a form may hold
  const name = fc.string({ minLength: 1, maxLength: 8 }).filter((n) => !/[[\]]/.test(n))
  const fields = fc.array(fc.tuple(name, fc.string({ maxLength: 12 })), { maxLength: 8 })

  test('flat fields: each name its value, a name given again its values in order', async () => {
    await fc.assert(
      fc.asyncProperty(fields, async (list) => {
        const expected: Record<string, string | string[]> = {}
        for (const [k, v] of list) {
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
          const had = expected[k]
          expected[k] = Object.hasOwn(expected, k) ? [had as string | string[], v].flat() : v
        }
        const { status, body } = await read(
          new URLSearchParams(list).toString(),
          'application/x-www-form-urlencoded',
        )
        expect(status).toBe(200)
        // a list of 0..n-1 keys reads as an array: compare as JSON does
        expect(body).toEqual(JSON.parse(JSON.stringify(arrayLike(expected))))
      }),
      { numRuns: 200 },
    )
  })
  test('any bytes, any form type: a body or a 400, never a 500, and no prototype changed', async () => {
    const type = fc.constantFrom(
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'multipart/form-data; boundary=x',
      'application/json',
    )
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 200 }), type, async (generated, t) => {
        const bytes = new Uint8Array(generated) // its own ArrayBuffer, as a request body takes
        const { status } = await read(bytes, t)
        expect([200, 400]).toContain(status)
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      }),
      { numRuns: 200 },
    )
  })
})

/** an object whose keys are 0..n-1, as readBody returns it: an array */
function arrayLike(value: Record<string, unknown>): unknown {
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((k, i) => k === String(i)) ? Object.values(value) : value
}
