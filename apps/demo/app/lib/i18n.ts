import { href } from 'fondu/client'

import { localizeHref } from '#/paraglide/runtime.js'

/** `href()` in the current language: `localizedHref('/i18n')` is `/de/i18n` on a German page */
export const localizedHref: typeof href = (path, ...params) => localizeHref(href(path, ...params))
