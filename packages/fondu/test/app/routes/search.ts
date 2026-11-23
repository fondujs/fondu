import { defineHandler } from 'fondu'
import * as z from 'zod/mini'

export const GET = defineHandler.withValidator({
  query: z.object({ q: z.string().check(z.minLength(2, 'Too short')) }),
})((c, { query }) => c.json({ q: query.q }))
