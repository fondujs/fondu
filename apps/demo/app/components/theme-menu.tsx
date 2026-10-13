import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

import { Button } from '#/components/ui/button.tsx'
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '#/components/ui/menu.tsx'

const themes = { system: [Monitor, 'System'], light: [Sun, 'Light'], dark: [Moon, 'Dark'] } as const
type Theme = keyof typeof themes

/**
 * System, light or dark, as the items of a menu: a cookie the server reads to write `<html class>`
 * (app/server.ts), so the first paint has it; here the class changes at once.
 */
export function ThemeItems() {
  const [theme, setTheme] = useState(() => document.documentElement.className as Theme) // a menu opens in the browser
  const choose = (value: Theme) => {
    document.cookie = `theme=${value}; path=/; max-age=${value === 'system' ? 0 : 31536000}; samesite=lax`
    document.documentElement.className = value
    setTheme(value)
  }
  return (
    <MenuRadioGroup value={theme} onValueChange={choose}>
      {Object.entries(themes).map(([value, [Icon, label]]) => (
        <MenuRadioItem key={value} value={value}>
          <span className="flex items-center gap-2">
            <Icon className="opacity-70" /> {label}
          </span>
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  )
}

/** The theme menu on its own (signed in, it is in the account menu) */
export function ThemeMenu() {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon" aria-label="Theme" data-testid="theme" />}>
        <Sun className="dark:hidden" />
        <Moon className="not-dark:hidden" />
      </MenuTrigger>
      <MenuPopup align="end">
        <ThemeItems />
      </MenuPopup>
    </Menu>
  )
}
