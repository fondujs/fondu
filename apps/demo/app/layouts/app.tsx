import { Link, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { AccountMenu } from '#/components/account-menu.tsx'
import { RenderBadge } from '#/components/demo.tsx'
import { Logo } from '#/components/logo.tsx'
import { Toasts } from '#/components/toasts.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Drawer, DrawerHeader, DrawerPanel, DrawerPopup, DrawerTitle } from '#/components/ui/drawer.tsx'

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

// The default layout (app.tsx): Inertia keeps it mounted while pages change. Below md the menu is a drawer from the
// left, as on fondu.dev's docs.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { url, component } = usePage()
  const [open, setOpen] = useState(false)
  const path = url.split(/[?#]/)[0]!
  const active = (to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(to + '/'))
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <div className="flex h-14 items-center justify-between border-b px-3 md:hidden">
        <Home />
        <Drawer position="left" open={open} onOpenChange={setOpen}>
          <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setOpen(true)} data-testid="menu">
            <Menu />
          </Button>
          <DrawerPopup showCloseButton className="w-72 max-w-[80%]">
            <DrawerHeader>
              <DrawerTitle>Demos</DrawerTitle>
            </DrawerHeader>
            <DrawerPanel>
              <Nav id="menu" active={active} onPick={() => setOpen(false)} />
            </DrawerPanel>
          </DrawerPopup>
        </Drawer>
      </div>
      <aside className="hidden px-3 py-3 md:sticky md:top-0 md:block md:h-dvh md:overflow-y-auto md:border-r">
        <div className="mb-4 flex h-9 items-center">
          <Home />
        </div>
        <Nav active={active} />
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center gap-2 border-b px-5">
          <span className="truncate font-mono text-xs text-muted-foreground" data-testid="component">
            /{component}
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

const Home = () => (
  <Link href={href('/')} className="flex items-center gap-2 px-2 font-heading font-semibold">
    <Logo className="size-6" /> Fondu
  </Link>
)

/** The demos, by group; where you are: a bar of the brand's gold */
function Nav({ id, active, onPick }: { id?: string; active: (to: string) => boolean; onPick?: () => void }) {
  return (
    <nav id={id} aria-label="Demos" className="grid gap-5">
      {sections.map(([group, links]) => (
        <div key={group}>
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group}</p>
          <ul className="grid gap-px">
            {links.map(([to, label]) => (
              <li key={to}>
                <Link
                  href={to}
                  prefetch
                  onClick={onPick}
                  aria-current={active(to) ? 'page' : undefined}
                  className="relative block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1.5 aria-[current=page]:before:-left-3 aria-[current=page]:before:w-0.5 aria-[current=page]:before:rounded-full aria-[current=page]:before:bg-brand"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
