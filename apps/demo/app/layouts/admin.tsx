import { Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { ReactNode } from 'react'

import { AccountMenu } from '#/components/account-menu.tsx'
import { RenderBadge } from '#/components/demo.tsx'
import { Logo } from '#/components/logo.tsx'
import { Toasts } from '#/components/toasts.tsx'

// The admin pages' layout (app.tsx picks it for pages named admin/…): a top bar instead of the demo sidebar.
// On a phone: the title and the account on the first line, the way back on the second.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
          <Link
            href={href('/admin/dashboard')}
            className="flex h-9 items-center gap-2 font-heading font-semibold"
            data-testid="admin-home"
          >
            <Logo className="size-6" /> Fondu Admin
          </Link>
          <div className="flex items-center gap-4 max-sm:order-last max-sm:w-full max-sm:pb-1">
            <RenderBadge />
            <Link href={href('/')} className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to the demos
            </Link>
          </div>
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
