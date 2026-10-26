import { href } from 'fondu/client'
import type { ReactNode } from 'react'

import { AccountMenu } from '#/components/account-menu.tsx'
import { Logo } from '#/components/logo.tsx'

// The admin pages' layout (routes/admin/_layout.tsx, outside the demos' group): a top bar instead of the demos'
// sidebar
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-2.5">
          <a
            href={href('/admin/dashboard')}
            className="flex h-9 items-center gap-2 font-heading font-semibold"
            data-testid="admin-home"
          >
            <Logo className="size-6" /> Fondu Admin
          </a>
          <span className="ml-auto flex items-center gap-2">
            <AccountMenu />
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  )
}
