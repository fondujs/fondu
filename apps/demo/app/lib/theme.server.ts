import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'

/** the theme chosen in the theme menu (components/theme-menu.tsx), or the system's */
export function themeOf(c: Context): 'system' | 'light' | 'dark' {
  const theme = getCookie(c, 'theme')
  return theme === 'light' || theme === 'dark' ? theme : 'system'
}
