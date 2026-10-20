import { back, defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

import { auth } from '#/modules/auth/auth.server.ts'

export const loader = defineHandler(async (c) => {
  const { users } = await auth.api.listUsers({
    query: { limit: 100, sortBy: 'createdAt' },
    headers: c.req.raw.headers,
  })
  return render(c, 'admin/dashboard', {
    accounts: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role ?? 'user',
    })),
  })
})

export const actions = {
  // POST /admin/dashboard?role — Better Auth's admin plugin checks the caller is an admin too
  role: defineHandler.withValidator({
    body: z.object({ userId: z.string(), role: z.enum(['user', 'admin']) }),
  })(async (c, { body }) => {
    await auth.api.setRole({ body, headers: c.req.raw.headers })
    flash(c, { message: `Role changed to ${body.role}` })
    return back(c)
  }),
}
