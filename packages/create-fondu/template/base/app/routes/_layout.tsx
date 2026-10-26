import { href } from 'fondu/client'
import type { ReactNode } from 'react'

import '../styles/app.css'

// Around every page (a directory's _layout.tsx: around its pages), kept mounted while pages change
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-2xl items-center gap-5 px-5 py-3 text-sm">
          <a href={href('/')} className="font-semibold text-ink no-underline">
            Fondu
          </a>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10">{children}</main>
    </>
  )
}
