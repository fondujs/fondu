// render()'s props as JSON delivers them (type checks: `tsc`; each @ts-expect-error must be an error)
import { expect, test } from 'vitest'

import { deepMerge, defer, once, scroll, type Paginated } from '../src/server/props.js'
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

// props combined (once(defer()), deepMerge(defer()), defer(scroll())) stand for their value
const combined: Delivered<{ permissions: string[]; results: { data: number[] }; feed: Paginated<number> }> = {
  permissions: once(defer(() => ['edit'])),
  results: deepMerge(defer(() => ({ data: [1] }))),
  feed: defer(scroll(() => ({ data: [1], currentPage: 1, previousPage: null, nextPage: 2 }))),
}
// @ts-expect-error still the value's type, combined
const combinedWrong: Delivered<{ permissions: string[] }> = { permissions: once(defer(() => [1])) }
// @ts-expect-error defer() takes a function (or the prop it defers), not a value
const deferValue = defer(['edit'])

test('the types above are checked by tsc', () => {
  expect([post, tree, loose, date, map, nested, wrong, combined, combinedWrong, deferValue]).toHaveLength(10)
})
