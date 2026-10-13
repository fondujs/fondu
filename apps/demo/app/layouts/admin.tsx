import { Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { ReactNode } from 'react'

import { ThemeMenu } from '#/components/theme-menu.tsx'
import { Toasts } from '#/components/toasts.tsx'
import { Account, RenderBadge } from '#/components/ui.tsx'

// The admin pages' layout (app.tsx picks it for pages named admin/…): a top bar instead of the demo sidebar.
// On a phone: the title and the account on the first line, the way back on the second.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface text-[13px]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <Link
            href={href('/admin/dashboard')}
            className="font-semibold text-ink no-underline"
            data-testid="admin-home"
          >
            Fondu Admin
          </Link>
          <RenderBadge />
          <Link
            href={href('/')}
            className="order-last w-full text-muted no-underline hover:text-ink sm:order-0 sm:w-auto"
          >
            ← Back to the demos
          </Link>
          <span className="ml-auto flex items-center gap-2">
            <ThemeMenu />
            <Account />
          </span>
        </div>
      </header>
      <Toasts />
      <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
    </div>
  )
}
