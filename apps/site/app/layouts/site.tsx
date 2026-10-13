import { Link, usePage } from '@inertiajs/react'
import type { ReactNode } from 'react'

import { Logo } from '#/components/logo.tsx'
import { Search } from '#/components/search.tsx'
import { ThemeMenu } from '#/components/theme-menu.tsx'

export const GITHUB = 'https://github.com/fondujs/fondu'

// Every page: the header, the page, the footer
export default function SiteLayout({ children }: { children: ReactNode }) {
  const { url } = usePage()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/88 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 sm:gap-2 sm:px-6">
          <Link href="/" className="mr-3 flex items-center gap-2 font-heading text-[15px] font-semibold">
            <Logo className="size-6" /> Fondu
          </Link>
          <nav aria-label="Site" className="flex items-center text-muted-foreground">
            <Link
              href="/docs"
              aria-current={url.startsWith('/docs') ? 'page' : undefined}
              className="rounded-md px-2 py-1.5 transition-colors hover:text-foreground aria-[current=page]:text-foreground"
            >
              Docs
            </Link>
            <a href="https://demo.fondu.dev" className="rounded-md px-2 py-1.5 transition-colors hover:text-foreground">
              Demo
            </a>
            <a href={GITHUB} className="rounded-md px-2 py-1.5 transition-colors hover:text-foreground">
              GitHub
            </a>
          </nav>
          <span className="ml-auto flex items-center gap-1 sm:gap-2">
            <Search />
            <ThemeMenu />
          </span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2">
            <Logo className="size-4" /> Fondu, MIT licensed
          </span>
          <span className="flex gap-4 sm:ml-auto">
            <a href={GITHUB} className="hover:text-foreground">
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/fondu" className="hover:text-foreground">
              npm
            </a>
            <a href="/llms.txt" className="hover:text-foreground">
              llms.txt
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
