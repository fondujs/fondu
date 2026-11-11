import { back, defineHandler, flash } from 'fondu'
import * as z from 'zod/mini'

import { callAuth, requireUser } from '#/modules/auth/auth.server.ts'

// POST /settings/name: the settings dialog's form (components/settings-dialog.tsx). The answer goes back to the page
// it was sent from, whose #settings/profile stays on the screen: the dialog is open with the errors, or the new name
export const POST = defineHandler.withValidator({
  body: z.object({
    name: z
      .string()
      .check(
        z.trim(),
        z.minLength(2, 'At least 2 characters'),
        z.maxLength(50, 'At most 50 characters'),
      ),
  }),
})(requireUser, async (c, { body }) => {
  // through Better Auth's handler: it also renews the session cookie, which holds the user (cookieCache)
  await callAuth(c, '/update-user', { name: body.name }, 'name')
  flash(c, { message: 'Name saved' })
  return back(c)
})
