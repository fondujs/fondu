import { defineMiddleware, share } from 'fondu'
import { auth, type User } from '../lib/auth.server'

// What this middleware sets, typed where it is set: `c.get('user')` (Hono's ContextVariableMap) and the shared
// props and flash data of every page (Inertia's InertiaConfig: `usePage().props` in the browser too).
declare module 'hono' {
  interface ContextVariableMap { user: User | null }
}
declare module '@inertiajs/core' {
  interface InertiaConfig {
    sharedPageProps: { auth: { user: { name: string; role: string } | null } }
    flashDataType: { message?: string }
  }
}

// Every request (404s too): who is signed in
export default defineMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  const user = session?.user ?? null
  c.set('user', user)
  share(c, { auth: { user: user && { name: user.name, role: user.role ?? 'user' } } })
  await next()
})
