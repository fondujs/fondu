import { defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

import { callAuth } from '#/lib/auth.server.ts'

export const loader = defineHandler(async (c) => (c.get('user') ? c.redirect('/account', 303) : render(c, 'signup')))

export const action = defineHandler.withValidator({
  body: z.object({
    name: z.string().check(z.trim(), z.minLength(2, 'At least 2 characters')),
    email: z.email('Enter a valid email'),
    password: z.string().check(z.minLength(8, 'At least 8 characters')),
  }),
})(async (c, { body }) => {
  await callAuth(c, '/sign-up/email', body, 'email')
  flash(c, { message: `Welcome, ${body.name}` })
  return c.redirect('/account', 303)
})
