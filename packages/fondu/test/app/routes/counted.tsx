import { defineHandler, render } from 'fondu'

import { calls } from './_deferred/calls.js'

// a loader that counts its runs, for test/prerender.test.ts (a prefetch runs none)
export const loader = defineHandler((c) => (calls.counted++, render(c, Counted)))

export default function Counted() {
  return null
}
