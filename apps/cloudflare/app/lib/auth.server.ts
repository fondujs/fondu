import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins'
import { env } from 'cloudflare:workers'
import { defineMiddleware, ValidationError } from 'fondu'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { db } from '#/db/index.server.ts'
import * as schema from '#/db/schema/index.ts'

// Better Auth: accounts, sessions, passwords, rate limits, roles (the admin plugin). Its HTTP API is mounted at
// /api/auth/* (routes/api/auth/[...all].ts). Forms post to the pages' actions, which pass them on with `callAuth`;
// what the server reads itself (the session, the admin's lists) is `auth.api`.
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  // the hosts this app answers on (add your domain): Better Auth builds its URLs from the request's
  baseURL: { allowedHosts: ['localhost:*', '*.workers.dev'] },
  database: drizzleAdapter(db, { provider: 'sqlite', schema, usePlural: true }),
  emailAndPassword: { enabled: true },
  // the signed-in user from a signed cookie for 5 minutes: most requests read no session from D1
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  // on: Better Auth turns it on by NODE_ENV, which a Worker doesn't have; in D1, shared by every isolate
  rateLimit: { enabled: true, storage: 'database' },
  // its own errors (an OAuth callback that failed…): to the sign-in page, which shows them
  onAPIError: { errorURL: '/login' },
  advanced: {
    cookiePrefix: 'fondu',
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }, // the client's address on Cloudflare
    database: { joins: true },
  },
  plugins: [admin()],
})

export type User = typeof auth.$Infer.Session.user

/** Guests are sent to sign in, and back here afterwards (`?next=`). */
export const requireUser = defineMiddleware(async (c, next) => {
  if (!c.get('user')) {
    const url = new URL(c.req.url)
    return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 303)
  }
  await next()
})

/** Admins only: guests sign in first, other users get the error page (403). */
export const requireAdmin = defineMiddleware(async (c, next) => {
  const user = c.get('user')
  if (!user) return requireUser(c, next)
  if (user.role !== 'admin') throw new HTTPException(403)
  await next()
})

/**
 * A form's data to Better Auth's API (`path` as in /api/auth/…), through its own handler, as a request from the
 * browser would go: rate limits, origin checks, its cookies. A refusal is a `ValidationError` on `field`, shown
 * under that field of the form.
 */
export async function callAuth<T = unknown>(c: Context, path: string, body: object, field: string): Promise<T> {
  const headers = new Headers(c.req.raw.headers) // the cookies, Origin, the client's address
  headers.set('content-type', 'application/json')
  headers.delete('content-length')
  const res = await auth.handler(
    new Request(new URL(`/api/auth${path}`, c.req.url), { method: 'POST', headers, body: JSON.stringify(body) }),
  )
  if (res.status === 429)
    throw new ValidationError({
      [field]: `Too many attempts: try again in ${res.headers.get('x-retry-after')} seconds`,
    })
  const data = (await res.json()) as T & { message?: string }
  if (!res.ok) throw new ValidationError({ [field]: data.message ?? 'Something went wrong' })
  for (const cookie of res.headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true })
  return data
}

/** `next` comes from the URL: follow it only when it stays on this site (resolved the way the browser will) */
export function safeNext(c: Context, next: string | undefined) {
  const here = new URL(c.req.url)
  const url = new URL(next ?? '/account', here)
  return url.origin === here.origin ? url.pathname.replace(/^\/+/, '/') + url.search + url.hash : '/account'
}
