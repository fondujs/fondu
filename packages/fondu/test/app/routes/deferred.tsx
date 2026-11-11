import { defer, defineHandler, render, share } from 'fondu'

import { calls } from './_deferred/calls.js'

// ?fail: `feed` throws; ?misuse: a deferred prop where none may be (share())
export const loader = defineHandler((c) => {
  share(c, { counted: () => (calls.shared++, 1) } as never)
  if (c.req.query('misuse') !== undefined) share(c, { oops: defer(() => 1) } as never)
  return render(c, Deferred, {
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
