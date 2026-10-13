import { defineHandler } from 'fondu'
import * as z from 'zod/mini'

export const GET = defineHandler.withValidator({
  params: z.object({ id: z.coerce.number().check(z.int()) }),
  query: z.object({ full: z.optional(z.string()) }),
})((c, { params, query }) => c.json({ id: params.id, full: query.full ?? null }))

// fondu({ prerender: true }): this route's pages, from its params
export const prerender = () => [{ id: 1 }, { id: 2 }]
