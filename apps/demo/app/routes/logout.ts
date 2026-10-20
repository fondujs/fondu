import { clearHistory, defineHandler, flash } from 'fondu'

import { callAuth } from '#/modules/auth/auth.server.ts'

// POST /logout: <Link href={href('/logout')} method="post" as="button">
export const action = defineHandler(async (c) => {
  await callAuth(c, '/sign-out', {}, 'session')
  flash(c, { message: 'Signed out' })
  clearHistory(c) // the private pages kept in the browser history can no longer be shown
  return c.redirect('/', 303)
})
