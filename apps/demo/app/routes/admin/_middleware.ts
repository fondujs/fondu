import { withoutSsr } from 'fondu'

import { requireAdmin } from '#/modules/auth/auth.server.ts'

// /admin and everything below: admins only, rendered in the browser only (no server render for a back office)
export default [requireAdmin, withoutSsr()]
