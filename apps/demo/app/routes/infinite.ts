import { defineHandler, render, scroll } from 'fondu'

const TOTAL = 120
const PER_PAGE = 15
const people = Array.from({ length: TOTAL }, (_, i) => ({
  id: i + 1,
  name: `Person ${i + 1}`,
  email: `person${i + 1}@example.com`,
}))

// `scroll()`: one page of the list (the page in `?page=`) and where the others are, for <InfiniteScroll>
export const loader = defineHandler((c) => {
  const last = Math.ceil(TOTAL / PER_PAGE)
  const page = Math.min(last, Math.max(1, Number(c.req.query('page') ?? 1) || 1))
  return render(c, 'infinite', {
    total: TOTAL,
    people: scroll(() => ({
      data: people.slice((page - 1) * PER_PAGE, page * PER_PAGE),
      currentPage: page,
      previousPage: page > 1 ? page - 1 : null,
      nextPage: page < last ? page + 1 : null,
    })),
  })
})
