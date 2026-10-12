import { clearHistory, defineHandler, flash } from 'fondu'
import { auth, forwardCookies } from '../lib/auth.server'

// POST /logout: <Link href={href('/logout')} method="post" as="button">
export const action = defineHandler(async (c) => {
  const { headers } = await auth.api.signOut({ headers: c.req.raw.headers, returnHeaders: true })
  forwardCookies(c, headers)
  flash(c, { message: 'Signed out' })
  clearHistory(c) // the private pages kept in the browser history can no longer be shown
  return c.redirect('/', 303)
})
