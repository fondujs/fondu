import { Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { ReactNode } from 'react'

import { AccountMenu } from '#/components/account-menu.tsx'
import { Logo } from '#/components/logo.tsx'
import { Toasts } from '#/components/toasts.tsx'

// The admin pages' layout (pages/admin/_layout.tsx, in place of app.tsx's AppLayout): a top bar instead of the demo sidebar
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-2.5">
          <Link
            href={href('/admin/dashboard')}
            className="flex h-9 items-center gap-2 font-heading font-semibold"
            data-testid="admin-home"
          >
            <Logo className="size-6" /> Fondu Admin
          </Link>
          <span className="ml-auto flex items-center gap-2">
            <AccountMenu />
          </span>
        </div>
      </header>
      <Toasts />
      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  )
}
