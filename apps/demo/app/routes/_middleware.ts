import { defineMiddleware, share } from 'fondu'
import { logger } from 'hono/logger'

import { themeOf } from '#/lib/theme.server.ts'
import { auth, type User } from '#/modules/auth/auth.server.ts'

declare module 'hono' {
  interface ContextVariableMap {
    user: User | null
  }
}
declare module 'fondu' {
  interface Register {
    shared: {
      auth: { user: { name: string; email: string; role: string; since: string } | null }
      theme: 'system' | 'light' | 'dark'
    }
    flash: { message?: string; error?: string; picked?: 'gold' | 'teal' | 'plum' }
  }
}

const visitor = defineMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  const user = session?.user ?? null
  c.set('user', user)
  share(c, {
    auth: {
      user: user && {
        name: user.name,
        email: user.email,
        role: user.role ?? 'user',
        since: user.createdAt.toISOString(),
      },
    },
    theme: themeOf(c),
  })
  await next()
})

export default [...(import.meta.env.MODE === 'development' ? [logger()] : []), visitor]
