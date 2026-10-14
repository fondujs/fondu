import { Link, usePage } from '@inertiajs/react'
import type { ReactNode } from 'react'

import { External } from '#/components/external.tsx'
import { Logo } from '#/components/logo.tsx'
import { Search } from '#/components/search.tsx'
import { ThemeMenu } from '#/components/theme-menu.tsx'

export const GITHUB = 'https://github.com/fondujs/fondu'

// Every page: the header (at the top on large screens; on small ones, the docs keep their own bar there), the page,
// the footer
export default function SiteLayout({ children }: { children: ReactNode }) {
  const { url } = usePage()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="z-40 border-b bg-background/88 backdrop-blur-md lg:sticky lg:top-0">
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
            <External
              href="https://demo.fondu.dev"
              className="rounded-md px-2 py-1.5 transition-colors hover:text-foreground"
            >
              Demo
            </External>
            <External href={GITHUB} className="rounded-md px-2 py-1.5 transition-colors hover:text-foreground">
              GitHub
            </External>
          </nav>
          <span className="ml-auto flex items-center gap-1 sm:gap-2">
            <Search />
            <ThemeMenu />
          </span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2">
            <Logo className="size-4" /> Fondu, MIT licensed
          </span>
          <span className="flex gap-4 sm:ml-auto">
            <External href={GITHUB} className="hover:text-foreground">
              GitHub
            </External>
            <External href="https://www.npmjs.com/package/fondu" className="hover:text-foreground">
              npm
            </External>
            <a href="/llms.txt" className="hover:text-foreground">
              llms.txt
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
