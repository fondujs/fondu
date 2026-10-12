import { APIError } from 'better-auth/api'
import { defineHandler, flash, render, ValidationError } from 'fondu'
import * as z from 'zod/mini'
import { auth, forwardCookies } from '../lib/auth.server'

export const loader = defineHandler(async (c) => (c.get('user') ? c.redirect('/account', 303) : render(c, 'signup')))

export const action = defineHandler.withValidator({
  body: z.object({
    name: z.string().check(z.trim(), z.minLength(2, 'At least 2 characters')),
    email: z.email('Enter a valid email'),
    password: z.string().check(z.minLength(8, 'At least 8 characters')),
  }),
})(async (c, { body }) => {
  try {
    const { headers } = await auth.api.signUpEmail({ body, headers: c.req.raw.headers, returnHeaders: true })
    forwardCookies(c, headers)
  } catch (error) {
    if (error instanceof APIError) throw new ValidationError({ email: error.body?.message ?? 'Could not create the account' })
    throw error
  }
  flash(c, { message: `Welcome, ${body.name}` })
  return c.redirect('/account', 303)
})
