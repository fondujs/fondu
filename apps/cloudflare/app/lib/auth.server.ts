import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { env } from 'cloudflare:workers'
import { defineMiddleware } from 'fondu'
import { HTTPException } from 'hono/http-exception'
import { db } from '../db/index.server'
import * as schema from '../db/schema'

// Better Auth: accounts, sessions, passwords, rate limits, roles (the admin plugin). Its HTTP API is mounted at
// /api/auth/* (routes/api/auth/[...all].ts); the pages call it on the server (routes/login.ts, signup.ts, logout.ts).
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  // the hosts this app answers on (add your domain): Better Auth builds its URLs from the request's
  baseURL: { allowedHosts: ['localhost:*', '*.workers.dev'] },
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: { enabled: true },
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

/** Better Auth answers with cookies: pass them on with the page's response */
export function forwardCookies(c: { header: (name: string, value: string, options: { append: true }) => void }, headers: Headers) {
  for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true })
}
