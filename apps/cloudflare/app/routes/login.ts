import { APIError } from 'better-auth/api'
import { defineHandler, flash, render, ValidationError } from 'fondu'
import type { Context } from 'hono'
import * as z from 'zod/mini'
import { auth, forwardCookies } from '../lib/auth.server'

export const loader = defineHandler(async (c) => {
  if (c.get('user')) return c.redirect('/account', 303) // already signed in
  return render(c, 'login', { next: inThisSite(c, c.req.query('next')) })
})

// Better Auth checks the password and starts the session; a wrong one: one message that doesn't say which part
export const action = defineHandler.withValidator({
  body: z.object({ email: z.email('Enter a valid email'), password: z.string().check(z.minLength(1, 'Enter your password')), next: z.optional(z.string()) }),
})(async (c, { body }) => {
  try {
    const { headers, response } = await auth.api.signInEmail({ body: { email: body.email, password: body.password }, headers: c.req.raw.headers, returnHeaders: true })
    forwardCookies(c, headers)
    flash(c, { message: `Signed in as ${response.user.name}` })
  } catch (error) {
    if (error instanceof APIError) throw new ValidationError({ email: 'Email or password is incorrect' })
    throw error
  }
  return c.redirect(inThisSite(c, body.next), 303)
})

/** `next` comes from the URL: follow it only when it stays on this site (resolved the way the browser will) */
function inThisSite(c: Context, next: string | undefined) {
  const here = new URL(c.req.url)
  const url = new URL(next ?? '/account', here)
  return url.origin === here.origin ? url.pathname.replace(/^\/+/, '/') + url.search + url.hash : '/account'
}
