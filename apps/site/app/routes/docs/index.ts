import { defineHandler, render } from 'fondu'

import { tocOf } from '#/lib/toc.server.ts'

// GET /docs: the introduction
export const loader = defineHandler(async (c) => render(c, 'docs/index', { toc: await tocOf('') }))
