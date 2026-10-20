import { encryptHistory, withoutSsr } from 'fondu'

import { requireAdmin } from '#/modules/auth/auth.server.ts'

// /admin and everything below: admins only, rendered in the browser only (no server render for a back office), private
// like /account: encrypted in the browser history, unreadable once signed out (clearHistory)
export default [requireAdmin, withoutSsr(), encryptHistory()]
