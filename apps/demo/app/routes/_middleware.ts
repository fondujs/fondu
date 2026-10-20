import { defineMiddleware, share } from 'fondu'

import { themeOf } from '#/lib/theme.server.ts'
import { auth, type User } from '#/modules/auth/auth.server.ts'

// What this middleware sets, typed where it is set: `c.get('user')` (Hono's ContextVariableMap) and the shared
// props and flash data of every page (Inertia's InertiaConfig: `usePage().props` in the browser too).
declare module 'hono' {
  interface ContextVariableMap {
    user: User | null
  }
}
declare module '@inertiajs/core' {
  interface InertiaConfig {
    sharedPageProps: {
      auth: { user: { name: string; email: string; role: string } | null }
      theme: 'system' | 'light' | 'dark'
    }
    flashDataType: { message?: string; error?: string; picked?: 'gold' | 'teal' | 'plum' }
  }
}

// Every request (404s too): who is signed in, the theme
export default defineMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  const user = session?.user ?? null
  c.set('user', user)
  share(c, {
    auth: { user: user && { name: user.name, email: user.email, role: user.role ?? 'user' } },
    theme: themeOf(c),
  })
  await next()
})
