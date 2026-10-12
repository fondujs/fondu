import { deepMerge, defineHandler, merge, prepend, render } from 'fondu'

const PER_PAGE = 3

export const loader = defineHandler((c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1)
  const area = c.req.query('area') ?? 'inbox'
  return render(c, 'merging', {
    page,
    // appended to what the client holds; an item with the same id replaces the old one (matchOn)
    messages: merge(
      () =>
        Array.from({ length: PER_PAGE }, (_, i) => {
          const id = (page - 1) * PER_PAGE + i + 1
          return { id, subject: `Message ${id}` }
        }),
      { matchOn: 'id' },
    ),
    // put in front of what the client holds
    log: prepend(() => [{ id: crypto.randomUUID(), at: new Date().toISOString().slice(11, 23) }]),
    // merged key by key, at any depth
    counters: deepMerge(() => ({ unread: { [area]: Math.floor(Math.random() * 50) } })),
  })
})
