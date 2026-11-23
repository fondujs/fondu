import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'

export function themeOf(c: Context): 'system' | 'light' | 'dark' {
  const theme = getCookie(c, 'theme')
  return theme === 'light' || theme === 'dark' ? theme : 'system'
}
