import { back, defineHandler, flash } from 'fondu'
import * as z from 'zod/mini'

export const action = defineHandler.withValidator({
  body: z.object({
    name: z.string().check(z.minLength(2, 'Too short')),
    email: z.optional(z.email('Bad email')),
  }),
})((c, { body }) => {
  flash(c, { message: `added ${body.name}` })
  return back(c)
})
