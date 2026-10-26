import type { Context, MiddlewareHandler } from 'hono'
import { generateCookie, getCookie } from 'hono/cookie'

import type { Flash } from '../types.js'
import { appendHeader } from './http.js'

/**
 * Flash data and validation errors for the next page, the way Laravel keeps them in the session: here a short
 * cookie (Hono has no session). Set before a redirect, shown by the next page, once. A page rendered in the same
 * request gets them directly (no cookie).
 */
interface Carried {
  flash?: Record<string, unknown>
  errors?: Record<string, unknown>
}
interface State {
  outgoing: Carried
  incoming: Carried | undefined
  read: boolean
}

const states = new WeakMap<Context, State>()
const state = (c: Context): State => {
  let s = states.get(c)
  if (!s) states.set(c, (s = { outgoing: {}, incoming: undefined, read: false }))
  return s
}

/** https, directly or behind a proxy that says so */
export const isSecure = (c: Context) =>
  new URL(c.req.url).protocol === 'https:' ||
  c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() === 'https'
const cookieName = (c: Context) => (isSecure(c) ? '__Host-fondu-flash' : 'fondu-flash')

/** Flash data for the next page (`usePage().flash`), typed by `Register['flash']`. */
export function flash(c: Context, data: Partial<Flash>) {
  const out = state(c).outgoing
  out.flash = { ...out.flash, ...data }
}

/** Validation errors for the next page (its `errors` prop). */
export function flashErrors(c: Context, errors: Record<string, unknown>) {
  state(c).outgoing.errors = errors
}

/** What this page shows: carried over from the previous request (read once), plus what this request set. */
export function takeCarried(c: Context): {
  flash: Record<string, unknown>
  errors: Record<string, unknown>
} {
  const s = state(c)
  if (!s.read) {
    s.read = true
    try {
      s.incoming = JSON.parse(getCookie(c, cookieName(c)) ?? 'null') ?? undefined
    } catch {
      s.incoming = undefined
    }
  }
  const carried = {
    flash: { ...s.incoming?.flash, ...s.outgoing.flash },
    errors: { ...s.incoming?.errors, ...s.outgoing.errors },
  }
  s.outgoing = {}
  return carried
}

/** Writes what is left for the next request; clears what was shown. Installed by `createApp()`. */
export const flashCookie: MiddlewareHandler = async (c, next) => {
  await next()
  const s = states.get(c)
  if (!s) return
  const name = cookieName(c)
  const options = { path: '/', httpOnly: true, sameSite: 'Lax', secure: isSecure(c) } as const
  if (s.outgoing.flash || s.outgoing.errors) {
    const value = JSON.stringify(s.outgoing)
    // browsers drop a cookie over ~4 KB without a word: the next page would show no errors, no flash
    if (encodeURIComponent(value).length > 4000)
      console.error(
        `[fondu] flash data and errors are too large for a cookie (${encodeURIComponent(value).length} bytes, about 4000 fit): the browser will drop them`,
      )
    appendHeader(c, 'Set-Cookie', generateCookie(name, value, { ...options, maxAge: 60 }))
  } else if (s.read && s.incoming)
    appendHeader(c, 'Set-Cookie', generateCookie(name, '', { ...options, maxAge: 0 }))
}
