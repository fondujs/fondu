import type { ReactNode } from 'react'
import { Link } from '@inertiajs/react'
import { href } from 'fondu/client'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav>
        <Link href={href('/')}>Todos</Link>
        <Link href={href('/about')}>About</Link>
      </nav>
      <main>{children}</main>
    </>
  )
}
