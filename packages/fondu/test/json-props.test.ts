// render()'s props as JSON delivers them (type checks: `tsc`; each @ts-expect-error must be an error)
import { expect, test } from 'vitest'

import type { Delivered } from '../src/server/protocol.js'

type Post = {
  title: string
  publishedAt: string
  tags: string[]
  author: { name: string; joinedAt?: string }
  views?: number
}
type Tree = { name: string; children: Tree[] }

// what becomes the page's types as JSON: a Date for a string, a toJSON(), nested and in arrays
const post: Delivered<Post> = {
  title: 'Hello',
  publishedAt: new Date(),
  tags: ['a'],
  author: { name: 'Ada', joinedAt: new Date() },
}
const tree: Delivered<{ root: Tree }> = { root: { name: 'a', children: [{ name: 'b', children: [] }] } }
// oxlint-disable-next-line no-explicit-any -- an untyped prop is not checked
const loose: Delivered<{ anything: unknown; any: any }> = { anything: new Map(), any: new Set() }

// @ts-expect-error the page types a prop as Date: it receives a string
const date: Delivered<{ at: Date }> = { at: new Date() }
// @ts-expect-error a Map arrives as {}
const map: Delivered<{ counts: Map<string, number> }> = { counts: new Map() }
// @ts-expect-error a Set nested in an object
const nested: Delivered<{ user: { roles: Set<string> } }> = { user: { roles: new Set() } }
// @ts-expect-error still the wrong type
const wrong: Delivered<Post> = { title: 1, publishedAt: '', tags: [], author: { name: 'Ada' } }

test('the types above are checked by tsc', () => {
  expect([post, tree, loose, date, map, nested, wrong]).toHaveLength(7)
})
