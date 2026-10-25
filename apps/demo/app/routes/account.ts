import { back, defineHandler, flash, render } from 'fondu'
import * as z from 'zod/mini'

import { callAuth, requireUser } from '#/modules/auth/auth.server.ts'

export const loader = defineHandler(requireUser, (c) => {
  const { name, email, role } = c.get('user')!
  // private: signing out forgets the pages kept for Back (clearHistory() in routes/logout.ts)
  return render(c, 'account', { account: { name, email, role: role ?? 'user' } })
})

export const action = defineHandler.withValidator({
  body: z.object({
    name: z
      .string()
      .check(
        z.trim(),
        z.minLength(2, 'At least 2 characters'),
        z.maxLength(40, 'At most 40 characters'),
      ),
  }),
})(requireUser, async (c, { body }) => {
  // through Better Auth's handler: it also renews the session cookie, which holds the user (cookieCache)
  await callAuth(c, '/update-user', { name: body.name }, 'name')
  flash(c, { message: 'Profile saved' })
  return back(c)
})
