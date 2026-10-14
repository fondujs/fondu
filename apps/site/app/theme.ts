/**
 * Sets the theme chosen in the theme menu (a cookie) on <html> before the page paints: inlined in the document
 * (server.ts), allowed by the Content Security Policy by its hash (vite.config.ts), as a static page has no nonce.
 */
export const THEME_SCRIPT =
  "document.documentElement.className=/(?:^|; )theme=(light|dark)/.exec(document.cookie)?.[1]??'system'"
