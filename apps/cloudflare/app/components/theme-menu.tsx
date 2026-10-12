import { Menu } from '@base-ui/react/menu'
import { usePage } from '@inertiajs/react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

const themes = { system: [Monitor, 'System'], light: [Sun, 'Light'], dark: [Moon, 'Dark'] } as const
type Theme = keyof typeof themes

/**
 * System, light or dark: a cookie the server reads to write `<html class>` (app/server.ts), so the first paint
 * has it; here it changes the page at once.
 */
export function ThemeMenu() {
  const [theme, setTheme] = useState<Theme>(usePage().props.theme)
  const choose = (value: Theme) => {
    document.cookie = `theme=${value}; path=/; max-age=${value === 'system' ? 0 : 31536000}; samesite=lax`
    document.documentElement.className = value
    setTheme(value)
  }
  const Icon = themes[theme][0]
  return (
    <Menu.Root>
      <Menu.Trigger className="btn px-2" aria-label="Theme" data-testid="theme">
        <Icon size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end">
          <Menu.Popup className="popup min-w-36">
            <Menu.RadioGroup value={theme} onValueChange={choose}>
              {Object.entries(themes).map(([value, [ItemIcon, label]]) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 outline-none data-highlighted:bg-canvas"
                >
                  <ItemIcon size={14} className="text-muted" /> {label}
                  <Menu.RadioItemIndicator className="ml-auto text-accent">
                    <Check size={14} />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
