import { Link, router, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { LogOut } from 'lucide-react'

import { ThemeMenu } from '#/components/theme-menu.tsx'
import { Avatar, AvatarFallback } from '#/components/ui/avatar.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '#/components/ui/menu.tsx'

/** The theme, and who is signed in (a shared prop: in the server-rendered HTML, never loading) or the way in */
export function AccountMenu() {
  const { user } = usePage().props.auth
  return (
    <>
      <ThemeMenu />
      {user ? (
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label={user.name}
                data-testid="user"
              />
            }
          >
            <Avatar className="size-7">
              <AvatarFallback className="bg-secondary font-semibold uppercase">
                {user.name.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
          </MenuTrigger>
          <MenuPopup align="end" className="w-56">
            <div className="grid px-2 py-1.5">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <MenuSeparator />
            {/* POST /logout */}
            <MenuItem onClick={() => router.post(href('/logout'))} data-testid="sign-out">
              <LogOut /> Sign out
            </MenuItem>
          </MenuPopup>
        </Menu>
      ) : (
        <Button
          variant="outline"
          size="sm"
          render={<Link href={href('/login')} />}
          data-testid="sign-in"
        >
          Sign in
        </Button>
      )}
    </>
  )
}
