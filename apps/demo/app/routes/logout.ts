import { defineHandler, flash } from 'fondu'

import { callAuth } from '#/modules/auth/auth.server.ts'

export const POST = defineHandler(async (c) => {
  await callAuth(c, '/sign-out', {}, 'session')
  flash(c, { message: 'Signed out' })
  return c.redirect('/', 303)
})
