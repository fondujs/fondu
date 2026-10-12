import { Link } from '@inertiajs/react'
import { href } from 'fondu/client'
import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <nav className="mx-auto flex max-w-2xl items-center gap-5 px-5 py-3 text-[13px] font-medium">
          <Link href={href('/')} className="flex items-center gap-2 text-[15px] font-semibold text-ink no-underline">
            <span className="grid size-7 place-items-center rounded-md bg-accent text-[13px] text-white">F</span> Fondu
          </Link>
          <Link href={href('/')} className="ml-auto text-ink/80 no-underline hover:text-ink">
            Todos
          </Link>
          <Link href={href('/about')} className="text-ink/80 no-underline hover:text-ink">
            About
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10">{children}</main>
    </>
  )
}
