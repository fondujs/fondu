import { withoutSsr } from 'fondu'

import { requireAdmin } from '#/modules/auth/auth.server.ts'

export default [requireAdmin, withoutSsr()]
