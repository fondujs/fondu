import type { Context, MiddlewareHandler } from 'hono'
import { generateCookie, getCookie } from 'hono/cookie'

import type { Flash } from '../types.js'
import { appendHeader, isSecure } from './http.js'

/**
 * Flash data and validation errors for the next page, the way Laravel keeps them in the session: here a short
 * cookie (Hono has no session). Set before a redirect, shown by the next page, once. A page rendered in the same
 * request gets them directly (no cookie).
 */
interface Carried {
  flash?: Record<string, unknown>
  errors?: Record<string, unknown>
}
/** what fits in a cookie (browsers drop one over ~4 KB, name and attributes included, without a word) */
const COOKIE_LIMIT = 4000
const cookieSize = (value: object) => encodeURIComponent(JSON.stringify(value)).length

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype

/**
 * The cookie comes back from the client: anyone can write it. What is not `{ flash?, errors? }` is ignored: `flash` a
 * plain object (its values any JSON: an app's flash data can be an object), `errors` a plain object of strings
 * (`ValidationError`'s).
 */
function parseCarried(raw: string | undefined): Carried | undefined {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!isPlain(value)) return undefined
    const { flash, errors } = value
    return (flash === undefined || isPlain(flash)) &&
      (errors === undefined ||
        (isPlain(errors) && Object.values(errors).every((v) => typeof v === 'string')))
      ? { flash, errors }
      : undefined
  } catch {
    return undefined
  }
}

/** `outgoing` as a cookie's value: whole if it fits, else without the flash data, else the errors that fit, in order */
function fit(outgoing: Carried): { value?: string; dropped?: string } {
  const whole = JSON.stringify(outgoing)
  if (encodeURIComponent(whole).length <= COOKIE_LIMIT) return { value: whole }
  const errors: Record<string, unknown> = {}
  for (const [key, message] of Object.entries(outgoing.errors ?? {}))
    if (cookieSize({ errors: { ...errors, [key]: message } }) <= COOKIE_LIMIT) errors[key] = message
  const kept = Object.keys(errors).length
  const all = Object.keys(outgoing.errors ?? {}).length
  const dropped = [
    ...(outgoing.flash ? ['the flash data'] : []),
    ...(kept < all ? [`${all - kept} of ${all} errors`] : []),
  ]
  return { value: kept ? JSON.stringify({ errors }) : undefined, dropped: dropped.join(' and ') }
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
    s.incoming = parseCarried(getCookie(c, cookieName(c)))
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
  // a HEAD request is a GET's headers: it leaves the flash for the page the browser asks for
  if (c.req.method === 'HEAD') return
  const name = cookieName(c)
  const options = { path: '/', httpOnly: true, sameSite: 'Lax', secure: isSecure(c) } as const
  let value: string | undefined
  if (s.outgoing.flash || s.outgoing.errors) {
    const result = fit(s.outgoing)
    value = result.value
    if (result.dropped)
      console.warn(
        `[fondu] flash data and errors are too large for a cookie (about ${COOKIE_LIMIT} bytes fit, the browser drops more): dropped ${result.dropped}`,
      )
  }
  if (value) appendHeader(c, 'Set-Cookie', generateCookie(name, value, { ...options, maxAge: 60 }))
  else if (s.read && s.incoming)
    appendHeader(c, 'Set-Cookie', generateCookie(name, '', { ...options, maxAge: 0 }))
}
