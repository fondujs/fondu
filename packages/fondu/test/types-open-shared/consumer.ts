import { render } from 'fondu'
import type { Context } from 'hono'

// A separate consumer program: its open registry must not merge with the closed one in types.test.ts.
declare module 'fondu' {
  interface Register {
    shared: { [key: string]: unknown; [key: `data-${string}`]: string; mode: 'text' | 'count' }
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
// @ts-expect-error omittable is not erasable: JSON would drop the middleware value from the response
render(c, Summary, { mode: { toJSON: () => undefined }, summary: 4 })

declare function ByPresence(p: { body: string } | { mode: 'count'; total: number }): null
render(c, ByPresence, { mode: 'count', total: 2 })
// @ts-expect-error shared mode may be present regardless of which fields the loader provided
render(c, ByPresence, { body: 'hello' })

declare function Note(
  p: { kind: 'note'; [key: string]: unknown; body: string } | { kind: 'total'; total: number },
): null
render(c, Note, { kind: 'note', body: 'hello', mode: 'text', extra: 1 })
// @ts-expect-error even between two open dictionaries the named shared mode is not arbitrary
render(c, Note, { kind: 'note', body: 'hello', mode: 'other' })

declare function IndexedMode(
  p: { [key: string]: number | 'text'; body: number } | { mode: 'count'; total: string },
): null
render(c, IndexedMode, { mode: 'text', body: 1 })
render(c, IndexedMode, { mode: 'count', total: 'two' })
// @ts-expect-error count from middleware would select the other branch, even with a page index signature
render(c, IndexedMode, { body: 1 })

declare function Unrelated(p: { title: unknown }): null
// @ts-expect-error an open index signature does not promise middleware will supply title
render(c, Unrelated)
render(c, Unrelated, { title: 'Hello' })

declare function Titled(p: { 'data-title': string }): null
// @ts-expect-error a patterned index signature does not promise any particular key either
render(c, Titled)
render(c, Titled, { 'data-title': 'Hello' })

// oxlint-disable-next-line no-explicit-any -- an untyped page still cannot widen a registered shared prop
declare function UntypedDictionary(p: Record<string, any>): null
render(c, UntypedDictionary, { extra: 4, mode: 'text' })
// @ts-expect-error the registered type still applies to this explicit entry
render(c, UntypedDictionary, { extra: 4, mode: 'other' })
