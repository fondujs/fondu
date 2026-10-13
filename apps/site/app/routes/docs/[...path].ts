import { defineHandler, render } from 'fondu'

import { docs } from '#/docs.ts'
import { tocOf } from '#/lib/toc.server.ts'

// GET /docs/<slug>: a page of docs.ts (an MDX file not listed there has no URL)
export const loader = defineHandler(async (c) => {
  const doc = docs.find((d) => d.slug && d.slug === c.req.param('path'))
  if (!doc) return c.notFound()
  return render(c, `docs/${doc.slug}` as 'docs/index', { toc: await tocOf(doc.slug) })
})

export const prerender = () => docs.filter((d) => d.slug).map((d) => ({ path: d.slug }))
