import { Link, usePage } from '@inertiajs/react'
import { href } from 'fondu/client'
import { Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { AccountMenu } from '#/components/account-menu.tsx'
import { RenderBadge } from '#/components/demo.tsx'
import { Logo } from '#/components/logo.tsx'
import { Toasts } from '#/components/toasts.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Drawer,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from '#/components/ui/drawer.tsx'

// the overview, then Fondu's demos, then Inertia's (as on the overview)
const sections: Array<[group: string | null, links: Array<[url: string, label: string]>]> = [
  [null, [[href('/'), 'Overview']]],
  [
    'Fondu',
    [
      [href('/routes'), 'Routes & actions'],
      [href('/http'), 'HTTP requests'],
      [href('/errors'), 'Errors'],
      [href('/i18n'), 'Languages'],
      [href('/account'), 'Account'],
      [href('/admin/dashboard'), 'Admin'],
    ],
  ],
  [
    'Inertia',
    [
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
      [href('/navigation'), 'Navigation'],
    ],
  ],
]

// The default layout (app.tsx): Inertia keeps it mounted while pages change. Below md the menu is a drawer from the
// left, as on fondu.dev's docs.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { url, component } = usePage()
  const [open, setOpen] = useState(false)
  // the Languages page has a URL per language (/de/i18n…): one item
  const path = component === 'i18n' ? href('/i18n') : url.split(/[?#]/)[0]!
  const active = (to: string) =>
    to === '/' ? path === '/' : path === to || path.startsWith(to + '/')
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[14rem_1fr]">
      <div className="flex h-14 items-center justify-between border-b px-3 md:hidden">
        <Home />
        <Drawer position="left" open={open} onOpenChange={setOpen}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Menu"
            onClick={() => setOpen(true)}
            data-testid="menu"
          >
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
          <span
            className="truncate font-mono text-xs text-muted-foreground"
            data-testid="component"
          >
            /{component}
          </span>
          <RenderBadge />
          <span className="ml-auto flex items-center gap-1">
            <a
              href="https://fondu.dev/docs"
              className="rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              data-testid="docs"
            >
              Docs
            </a>
            <a
              href="https://github.com/fondujs/fondu"
              aria-label="Fondu on GitHub"
              className="mr-1 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
              data-testid="github"
            >
              <GitHub className="size-4" />
            </a>
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
    <Logo className="size-6" /> Fondu{' '}
    <span className="font-normal text-muted-foreground">demo</span>
  </Link>
)

/** GitHub's mark (Octicons' mark-github), for the link to the repository */
const GitHub = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" className={className}>
    <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
  </svg>
)

/** The demos, by group; where you are: a bar of the brand's gold */
function Nav({
  id,
  active,
  onPick,
}: {
  id?: string
  active: (to: string) => boolean
  onPick?: () => void
}) {
  return (
    <nav id={id} aria-label="Demos" className="grid gap-5">
      {sections.map(([group, links]) => (
        <div key={group ?? 'start'}>
          {group && <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{group}</p>}
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
