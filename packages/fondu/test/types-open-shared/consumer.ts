import { render } from 'fondu'
import type { Context } from 'hono'

// A separate consumer program: its open registry must not merge with the closed one in types.test.ts.
declare module 'fondu' {
  interface Register {
    shared: { [key: string]: unknown; mode: 'text' | 'count' }
  }
}

declare const c: Context
declare function Page(p: { mode?: 'text'; body: string } | { mode: 'count'; total: number }): null
render(c, Page, { mode: 'text', body: 'hello' })
render(c, Page, { mode: 'count', total: 2 })
// @ts-expect-error middleware may supply count, which requires total, not body
render(c, Page, { body: 'hello' })
// @ts-expect-error the page and middleware disagree about this branch
render(c, Page, { mode: 'count', body: 'hello' })

declare function Summary(p: { mode: string; summary: number }): null
render(c, Summary, { summary: 4 })
render(c, Summary, { mode: 'count', summary: 4 })
// @ts-expect-error layouts still read 'text' | 'count', even though this page can receive any string
render(c, Summary, { mode: 'other', summary: 4 })

declare function Unrelated(p: { title: unknown }): null
// @ts-expect-error an open index signature does not promise middleware will supply title
render(c, Unrelated)
render(c, Unrelated, { title: 'Hello' })
