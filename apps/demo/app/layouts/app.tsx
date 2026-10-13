import { Link, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Menu, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { AccountMenu } from '#/components/account-menu.tsx'
import { RenderBadge } from '#/components/demo.tsx'
import { Logo } from '#/components/logo.tsx'
import { Toasts } from '#/components/toasts.tsx'
import { Button } from '#/components/ui/button.tsx'
import { cn } from '#/lib/utils.ts'

const sections: Array<[group: string, links: Array<[url: string, label: string]>]> = [
  [
    'Inertia',
    [
      [href('/'), 'Overview'],
      [href('/props'), 'Props'],
      [href('/partial'), 'Partial reloads'],
      [href('/deferred'), 'Deferred props'],
      [href('/merging'), 'Merging props'],
      [href('/infinite'), 'Infinite scroll'],
      [href('/once'), 'Once props'],
      [href('/contacts'), 'Forms & validation'],
      [href('/redirects'), 'Redirects'],
      [href('/versioning'), 'Asset versioning'],
      [href('/history'), 'History encryption'],
      [href('/ssr'), 'Server-side rendering'],
    ],
  ],
  [
    'Fondu',
    [
      [href('/routes'), 'Routes & actions'],
      [href('/http'), 'HTTP requests'],
      [href('/navigation'), 'Navigation'],
      [href('/errors'), 'Errors'],
      [href('/account'), 'Account'],
      [href('/admin/dashboard'), 'Admin'],
    ],
  ],
]

// The default layout (app.tsx): Inertia keeps it mounted while pages change. Below md the menu folds into a button.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { url, component } = usePage()
  const [open, setOpen] = useState(false)
  const path = url.split(/[?#]/)[0]!
  const active = (to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/'))
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <aside className="border-b px-3 py-2.5 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0 md:py-3">
        <div className="flex h-9 items-center justify-between md:mb-4">
          <Link href={href('/')} className="flex items-center gap-2 px-2 font-heading font-semibold">
            <Logo className="size-6" /> Fondu
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="menu"
            onClick={() => setOpen(!open)}
            data-testid="menu"
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
        <nav id="menu" aria-label="Demos" className={cn('mt-3 gap-5 md:mt-0 md:grid', open ? 'grid' : 'hidden')}>
          {sections.map(([group, links]) => (
            <div key={group}>
              <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group}</p>
              <ul className="grid gap-px">
                {links.map(([to, label]) => (
                  <li key={to}>
                    {/* where you are: a bar of the brand's gold */}
                    <Link
                      href={to}
                      prefetch
                      onClick={() => setOpen(false)}
                      aria-current={active(to) ? 'page' : undefined}
                      className="relative block rounded-md px-2 py-1.5 text-sm text-foreground/72 transition-colors hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1.5 aria-[current=page]:before:-left-3 aria-[current=page]:before:w-0.5 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-brand"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center gap-2 border-b px-5">
          <span className="truncate font-mono text-xs text-muted-foreground" data-testid="component">
            {component}
          </span>
          <RenderBadge />
          <span className="ml-auto flex items-center gap-2">
            <AccountMenu />
          </span>
        </header>
        <Toasts />
        <main className="mx-auto max-w-5xl px-5 py-10 [view-transition-name:main]">{children}</main>
      </div>
    </div>
  )
}
