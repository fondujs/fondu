// render()'s props, typed by the page's component and the shared props (type checks: `tsc`; each @ts-expect-error
// must be an error)
import type { Context } from 'hono'
import { expect, test } from 'vitest'

import type { render } from '../src/server/protocol.js'

type Auth = { user: string | null }
declare module '@inertiajs/core' {
  interface InertiaConfig {
    sharedPageProps: { auth: Auth }
  }
}
declare module '../src/types.js' {
  interface Register {
    pages: {
      bare: { default: () => null }
      titled: { default: (props: { title: string; auth: Auth }) => null }
      clashing: { default: (props: { auth: string }) => null }
    }
  }
}

// type-checked only, never called
const typed = (call: (r: typeof render, c: Context) => unknown) => call

const checks = [
  typed((r, c) => r(c, 'bare')),
  // a page without props, with options: its props are {} whatever is shared (#83)
  typed((r, c) => r(c, 'bare', {}, { status: 404 })),
  // @ts-expect-error a page without props takes none
  typed((r, c) => r(c, 'bare', { title: 'Hello' })),
  // the shared props a page takes may be left out, or given
  typed((r, c) => r(c, 'titled', { title: 'Hello' })),
  typed((r, c) => r(c, 'titled', { title: 'Hello', auth: { user: null } })),
  // @ts-expect-error a prop of its own is missing
  typed((r, c) => r(c, 'titled', {})),
  // @ts-expect-error a page prop named like a shared prop, of another type
  typed((r, c) => r(c, 'clashing', { auth: 'Ada' })),
]

test('the types above are checked by tsc', () => {
  expect(checks).toHaveLength(7)
})
