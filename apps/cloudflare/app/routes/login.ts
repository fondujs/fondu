import { defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

import { callAuth, safeNext } from '#/lib/auth.server.ts'

export const loader = defineHandler(async (c) => {
  // Better Auth's own errors (onAPIError.errorURL) arrive as ?error=: shown once, as a toast
  const error = c.req.query('error')
  if (error) {
    flash(c, { error: `Sign-in failed: ${error.replaceAll('_', ' ').toLowerCase()}` })
    return c.redirect('/login', 303)
  }
  if (c.get('user')) return c.redirect('/account', 303) // already signed in
  return render(c, 'login', { next: safeNext(c, c.req.query('next')) })
})

// Better Auth checks the password and starts the session; a wrong one: one message that doesn't say which part
export const action = defineHandler.withValidator({
  body: z.object({
    email: z.email('Enter a valid email'),
    password: z.string().check(z.minLength(1, 'Enter your password')),
    next: z.optional(z.string()),
  }),
})(async (c, { body }) => {
  const { user } = await callAuth<{ user: { name: string } }>(
    c,
    '/sign-in/email',
    { email: body.email, password: body.password },
    'email',
  )
  flash(c, { message: `Signed in as ${user.name}` })
  return c.redirect(safeNext(c, body.next), 303)
})
