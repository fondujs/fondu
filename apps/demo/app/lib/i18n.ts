import { href } from 'fondu/client'

import { localizeHref } from '#/paraglide/runtime.js'

export const localizedHref: typeof href = (path, ...params) => localizeHref(href(path, ...params))
