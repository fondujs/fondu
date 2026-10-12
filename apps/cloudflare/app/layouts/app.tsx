import { Link, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { useState, type ReactNode } from 'react'

import { ThemeMenu } from '#/components/theme-menu.tsx'
import { Toasts } from '#/components/toasts.tsx'
import { Account, RenderBadge } from '#/components/ui.tsx'

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
    <div className="min-h-dvh md:grid md:grid-cols-[13rem_1fr]">
      <aside className="border-b border-line bg-surface px-3 py-3 md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0 md:py-4">
        <div className="flex items-center justify-between md:mb-5">
          <Link
            href={href('/')}
            className="flex items-center gap-2 px-2 text-[15px] font-semibold text-ink no-underline"
          >
            <span className="grid size-7 place-items-center rounded-md bg-accent text-[13px] text-white">F</span> Fondu
          </Link>
          <button
            type="button"
            className="btn md:hidden"
            aria-expanded={open}
            aria-controls="menu"
            onClick={() => setOpen(!open)}
            data-testid="menu"
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        <nav id="menu" aria-label="Demos" className={`mt-3 gap-4 md:mt-0 md:grid ${open ? 'grid' : 'hidden'}`}>
          {sections.map(([group, links]) => (
            <div key={group}>
              <p className="mb-1 px-2 text-[11px] font-medium text-muted">{group}</p>
              <ul className="grid">
                {links.map(([to, label]) => (
                  <li key={to}>
                    <Link
                      href={to}
                      prefetch
                      onClick={() => setOpen(false)}
                      aria-current={active(to) ? 'page' : undefined}
                      className={`block rounded-md px-2 py-1 text-[13px] no-underline transition-colors ${active(to) ? 'bg-accent-soft font-medium text-accent' : 'text-ink/80 hover:bg-canvas hover:text-ink'}`}
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
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-[13px]">
          <span className="font-mono text-xs text-muted capitalize" data-testid="component">
            {component}
          </span>
          <RenderBadge />
          <span className="ml-auto flex items-center gap-2">
            <ThemeMenu />
            <Account />
          </span>
        </header>
        <Toasts />
        <main className="mx-auto max-w-5xl px-5 py-10 [view-transition-name:main]">{children}</main>
      </div>
    </div>
  )
}
