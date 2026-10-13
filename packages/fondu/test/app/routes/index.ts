import { always, deepMerge, defer, defineHandler, merge, once, optional, render, scroll } from 'fondu'

export const prerender = true

export const loader = defineHandler((c) =>
  render(
    c,
    'home' as never,
    {
      plain: 'value',
      fn: () => 'computed',
      report: optional(() => 'report'),
      count: always(1),
      stats: defer(() => ({ n: 1 })),
      slow: defer(() => 'slow', { group: 'slow' }),
      flaky: defer(
        (): string => {
          throw new Error('down')
        },
        { rescue: true },
      ),
      plan: once(() => 'plan', { fresh: c.req.query('fresh') !== undefined }),
      items: merge(() => [{ id: 1 }], { matchOn: 'id' }),
      tree: deepMerge(() => ({ a: { b: 1 } })),
      people: scroll(() => ({ data: [{ id: 1 }], currentPage: 1, previousPage: null, nextPage: 2 })),
    } as never,
  ),
)
