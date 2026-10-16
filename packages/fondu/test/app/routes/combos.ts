import { deepMerge, defer, defineHandler, merge, once, optional, prepend, render, scroll } from 'fondu'

// props combined as Inertia's docs combine them (Laravel's ->once(), ->deepMerge(), ->defer())
export const loader = defineHandler((c) =>
  render(
    c,
    'home' as never,
    {
      permissions: once(defer(() => ['edit'])),
      categories: once(optional(() => ['news'])),
      activity: once(merge(() => [{ id: 1 }])),
      results: deepMerge(defer(() => ({ data: [1] }))),
      users: merge(() => ({ data: [{ id: 1 }], total: 1 }), { path: 'data', matchOn: 'data.id' }),
      chat: prepend(() => ({ messages: ['hi'] }), { path: 'messages' }),
      thread: deepMerge(() => ({ messages: [{ id: 1 }] }), { matchOn: 'messages.id' }),
      feed: defer(scroll(() => ({ data: [1], currentPage: 1, previousPage: null, nextPage: 2 }))),
    } as never,
  ),
)
