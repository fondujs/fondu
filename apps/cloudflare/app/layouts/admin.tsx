import type { ReactNode } from 'react'
import { Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Account, Flash, RenderBadge } from '../components/ui'

// The admin pages' layout (app.tsx picks it for pages named admin/…): a top bar instead of the demo sidebar
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center gap-3 bg-ink px-5 py-3 text-[13px] text-canvas">
        <Link href={href('/admin/dashboard')} className="font-semibold text-canvas no-underline" data-testid="admin-home">Fondu Admin</Link>
        <RenderBadge />
        <Link href={href('/')} className="text-canvas/70 no-underline hover:text-canvas">← Back to the demos</Link>
        <Account />
      </header>
      <Flash />
      <main className="mx-auto max-w-[56rem] px-5 py-10">{children}</main>
    </div>
  )
}
