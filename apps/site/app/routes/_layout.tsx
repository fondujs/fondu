import { usePage } from 'fondu/client'
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { GitHub } from '#/components/brands.tsx'
import { External } from '#/components/external.tsx'
import { Logo } from '#/components/logo.tsx'
import { Search } from '#/components/search.tsx'
import { ThemeMenu } from '#/components/theme-menu.tsx'
import { Button } from '#/components/ui/button.tsx'

import '../styles/app.css'

const GITHUB = 'https://github.com/fondujs/fondu'

const links: Array<[label: string, url: string]> = [
  ['llms.txt', '/llms.txt'],
  ['Changelog', `${GITHUB}/releases`],
  ['GitHub', GITHUB],
  ['npm', 'https://www.npmjs.com/package/fondu'],
]

// routes/_layout.tsx, around every page: the header (at the top on large screens; on small ones, the docs keep their own
// bar there), the page, the footer. The header's last button: the docs, or in the docs their search.
export default function SiteLayout({ children }: { children: ReactNode }) {
  const { url } = usePage()
  const inDocs = url.startsWith('/docs')
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="z-40 border-b bg-background/88 backdrop-blur-md lg:sticky lg:top-0">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 font-heading text-[15px] font-semibold">
            <Logo className="size-6" /> Fondu
          </a>
          <span className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              render={<External href={GITHUB} aria-label="Fondu on GitHub" />}
            >
              <GitHub />
            </Button>
            <ThemeMenu />
            <span className="ml-1">
              {inDocs ? (
                <Search />
              ) : (
                <Button variant="outline" render={<a href="/docs" />}>
                  Docs
                </Button>
              )}
            </span>
          </span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="grid gap-2">
            <span className="flex items-center gap-2 font-heading font-semibold text-foreground">
              <Logo className="size-5" /> Fondu
            </span>
            <p>This site is built with Fondu. Released under the MIT License.</p>
          </div>
          <ul className="grid gap-3 md:flex md:gap-6">
            {links.map(([label, href]) => (
              <li key={label}>
                {href.startsWith('/') ? (
                  <a href={href} className="transition-colors hover:text-foreground">
                    {label}
                  </a>
                ) : (
                  <External
                    href={href}
                    className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
                  >
                    {label}
                    <ArrowUpRight className="size-3.5" />
                  </External>
                )}
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  )
}
