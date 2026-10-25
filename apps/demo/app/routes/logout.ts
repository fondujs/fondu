import { clearHistory, defineHandler, flash } from 'fondu'

import { callAuth } from '#/modules/auth/auth.server.ts'

// POST /logout: a form of the account menu
export const action = defineHandler(async (c) => {
  await callAuth(c, '/sign-out', {}, 'session')
  flash(c, { message: 'Signed out' })
  clearHistory(c) // the private pages kept in the browser history can no longer be shown
  return c.redirect('/', 303)
})
