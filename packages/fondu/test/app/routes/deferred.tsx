import { defer, defineHandler, render, share } from 'fondu'

import { calls } from './_deferred/calls.js'

// a thenable that is not a Promise
// oxlint-disable-next-line unicorn/no-thenable
const thenable = { then() {} }

// ?fail: `feed` throws; ?misuse: a deferred prop where none may be (share()); ?promise: a promise as a prop;
// ?nested: a promise inside a prop (the app's own JSON)
export const loader = defineHandler((c) => {
  share(c, { counted: () => (calls.shared++, 1) } as never)
  if (c.req.query('misuse') !== undefined) share(c, { oops: defer(() => 1) } as never)
  const own =
    c.req.query('promise') === 'thenable'
      ? { late: thenable }
      : c.req.query('promise') !== undefined
        ? { late: Promise.resolve(1) }
        : {}
  const nested = c.req.query('nested') !== undefined ? { inner: { late: Promise.resolve(1) } } : {}
  return render(c, Deferred, {
    ...(own as object),
    ...(nested as object),
    title: 'Dashboard',
    stats: defer(() => (calls.stats++, { total: 3 })),
    feed: defer(async () => {
      calls.feed++
      if (c.req.query('fail') !== undefined) throw new Error('the feed is down')
      return ['a']
    }),
  })
})

export default function Deferred(_: { title: string; stats?: { total: number }; feed?: string[] }) {
  return null
}
