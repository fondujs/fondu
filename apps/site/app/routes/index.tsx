import {
  BadgeCheck,
  Check,
  ChevronDown,
  Copy,
  FileCode,
  FolderTree,
  Languages,
  Rocket,
  Server,
  TextCursorInput,
  TriangleAlert,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'

import { Bun, Hono, Npm, Pnpm, React as ReactMark, Vite, Yarn } from '#/components/brands.tsx'
import { useGroup } from '#/components/code.tsx'
import { CopyPrompt } from '#/components/copy-prompt.tsx'
import { External } from '#/components/external.tsx'
import { Logo } from '#/components/logo.tsx'
import { Meta } from '#/components/meta.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '#/components/ui/menu.tsx'
import Code from '#/landing/code.mdx'
import { cn } from '#/lib/utils.ts'

// the package managers, as the quick start's tabs name them (their choice is shared: `group="pm"`)
const managers = {
  npm: [Npm, 'npm create fondu@latest', 'text-[#CB3837]'],
  pnpm: [Pnpm, 'pnpm create fondu@latest', 'text-[#F69220]'],
  yarn: [Yarn, 'yarn create fondu', 'text-[#2C8EBB]'],
  bun: [Bun, 'bun create fondu@latest', 'text-foreground'],
} as const
type Manager = keyof typeof managers

const parts: Array<{ name: string; url: string; mark: ReactNode; tint: string; does: string }> = [
  {
    name: 'Hono',
    url: 'https://hono.dev',
    mark: <Hono className="size-6 text-[#E36002]" />,
    tint: 'from-[#E36002]/10 hover:bg-[#E36002]/5',
    does: 'Answers every request. Your routes are its handlers, with its middleware, CSRF protection and security headers.',
  },
  {
    name: 'React',
    url: 'https://react.dev',
    mark: <ReactMark className="size-6 text-[#087EA4] dark:text-[#61DAFB]" />,
    tint: 'from-[#087EA4]/10 hover:bg-[#087EA4]/5',
    does: 'Renders your page components and manages their state. React DOM renders the first page on the server and hydrates it in the browser.',
  },
  {
    name: 'Fondu',
    url: '/docs',
    mark: <Logo className="size-6" />,
    tint: 'from-brand/16 hover:bg-brand/8',
    does: 'Holds them together: routes from files, typed pages and URLs, the server render, the pages swapped in the browser.',
  },
  {
    name: 'Vite',
    url: 'https://vite.dev',
    mark: <Vite className="size-6 text-[#9135FF]" />,
    tint: 'from-[#9135FF]/10 hover:bg-[#9135FF]/5',
    does: 'Serves the app while you work, updating it in place, and builds it for production.',
  },
]

const features: Array<[icon: LucideIcon, title: string, slug: string, text: string]> = [
  [
    FolderTree,
    'Routes from files',
    'routes',
    'The file path is the URL: params, optional segments, catch-alls, groups, and middleware for a directory.',
  ],
  [
    BadgeCheck,
    'Typed pages and URLs',
    'type-safety',
    'render() checks the props a page takes, href() the params a URL needs, both typed from your files.',
  ],
  [
    TextCursorInput,
    'Forms and validation',
    'forms',
    'Plain forms, one Standard Schema for the server and the browser. The errors land on the page, what was typed kept.',
  ],
  [
    Server,
    'Server-side rendering',
    'ssr',
    'The first visit gets the page as HTML, then pages are swapped in place. Off for the pages that need none.',
  ],
  [
    FileCode,
    'Static pages',
    'static-pages',
    'A page that is the same for everyone can be written to a file at build time, and served with the same headers as the rest.',
  ],
  [
    Languages,
    'A URL per language',
    'i18n',
    '[[locale]] makes a segment optional, and a list of values keeps it to your languages.',
  ],
  [
    TriangleAlert,
    'Error pages',
    'errors',
    'Unknown URLs and thrown errors get your error page. In development, a thrown error shows its full report instead.',
  ],
  [
    Rocket,
    'Bun, Node or Workers',
    'deploying',
    'One vite build for Node and Bun; Cloudflare Workers through its own Vite plugin.',
  ],
]

export default function Home() {
  return (
    <>
      <Meta description="Fondu is a small meta-framework for full-stack React apps, built on Hono and Vite. It runs on Bun, Cloudflare Workers and Node." />

      <section className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <div className="min-w-0">
          <h1 className="text-[2.5rem]/[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-[3.5rem]/[1.03]">
            <span className="block">Server routes.</span>
            <span className="block">React pages.</span>
            <span className="mt-1.25 block font-serif text-[1.1em]/[1] font-normal tracking-[-0.01em] italic">
              No API in between.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base/normal text-(--hero-text) sm:text-lg/normal">
            A route file holds a{' '}
            <Chip
              mark={<Hono />}
              className="bg-[#E36002]/10 font-mono text-[#B44C02] dark:text-[#FF9A52]"
            >
              Hono
            </Chip>{' '}
            handler and the{' '}
            <Chip
              mark={<ReactMark />}
              className="bg-[#087EA4]/10 font-mono text-[#066985] dark:bg-[#61DAFB]/10 dark:text-[#61DAFB]"
            >
              React
            </Chip>{' '}
            page it renders. Plain links and forms change pages in place: no API to write, no
            client-side router to keep in sync.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" render={<a href="/docs" />}>
              Read the docs
            </Button>
            <CopyPrompt />
          </div>
          <CreateCommand />
        </div>
        {/* the one thing to see: a route file, its loader and its page, the props they share highlighted */}
        <Mosaic>
          <div aria-label="A route file" role="group" className="hero-code">
            <Code
              components={{
                pre: (props: ComponentProps<'pre'>) => <pre {...props} />,
                CodeTabs: BrowserCode,
              }}
            />
          </div>
        </Mosaic>
      </section>

      <section className="border-t border-border/64">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Who does what
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground sm:text-base">
            Three projects you may know already do most of the work, and their docs apply as they
            are; Fondu holds them together.
          </p>
          <ul className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border/32 bg-border sm:grid-cols-2 lg:grid-cols-4">
            {parts.map(({ name, url, mark, tint, does }) => {
              const Anchor = url.startsWith('/') ? 'a' : External
              return (
                <li key={name} className="bg-background">
                  <Anchor
                    href={url}
                    className={cn(
                      'flex h-full flex-col gap-3 bg-linear-to-br to-transparent to-60% p-5 transition-colors sm:p-6',
                      tint,
                    )}
                  >
                    {mark}
                    <span className="font-heading text-base font-semibold">{name}</span>
                    <span className="text-muted-foreground">{does}</span>
                  </Anchor>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="border-t border-border/64">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            What Fondu adds
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground sm:text-base">
            The parts no one of them does, each a page of the docs.
          </p>
          <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border/32 bg-border md:grid-cols-2 xl:grid-cols-4">
            {features.map(([Icon, title, slug, text]) => (
              <li key={slug} className="bg-card">
                <a
                  href={`/docs/${slug}`}
                  className="flex h-full flex-col items-start bg-card p-4 text-card-foreground transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:p-5"
                >
                  <span className="mb-3 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <h3 className="mb-1 text-base font-medium">{title}</h3>
                  <p className="text-muted-foreground">{text}</p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-border/64">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center sm:px-6">
          <h2 className="text-[2.25rem]/[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[3.25rem]/[1.05]">
            Start with one route
            <span className="block font-serif text-[1.1em] font-normal tracking-[-0.01em] italic">
              and one page.
            </span>
          </h2>
          <p className="mt-5 max-w-md text-muted-foreground sm:text-base">
            The quick start creates an app for your runtime and walks through its first page.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" render={<a href="/docs/quick-start" />}>
              Quick start
            </Button>
            <Button size="lg" variant="outline" render={<External href="https://demo.fondu.dev" />}>
              See the demo <ArrowUpRight />
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}

/** The hero's single code example: browser-style chrome, without the docs' interactive tabs. */
function BrowserCode({ children }: { children: ReactNode }) {
  return (
    <div className="code-tabs overflow-hidden rounded-xl">
      <div aria-hidden="true" className="flex h-9 items-center gap-1.5 border-b px-4">
        <span className="size-2.5 rounded-full bg-destructive/70" />
        <span className="size-2.5 rounded-full bg-warning/70" />
        <span className="size-2.5 rounded-full bg-success/70" />
      </div>
      {children}
    </div>
  )
}

/** a project named in a sentence: its mark and name, in its color */
function Chip({
  mark,
  className,
  children,
}: {
  mark: ReactNode
  className: string
  children: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 align-[-0.1em] text-[15px]/[1.5] font-medium whitespace-nowrap [&_svg]:size-[0.9em]',
        className,
      )}
    >
      {mark}
      {children}
    </span>
  )
}

/** the hero's code, on a field of the brand's gold, its corners cut in squares */
function Mosaic({ children }: { children: ReactNode }) {
  return (
    <div className="mosaic relative min-w-0 p-8 sm:p-10">
      {(['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'] as const).map(
        (corner) => (
          <span key={corner} aria-hidden="true" className={cn('mosaic-corner absolute', corner)} />
        ),
      )}
      <div className="relative">{children}</div>
    </div>
  )
}

/** `npm create fondu@latest`, for the package manager chosen (the quick start's too), copied on a click */
function CreateCommand() {
  const [chosen, choose] = useGroup('pm')
  const manager: Manager = chosen && chosen in managers ? (chosen as Manager) : 'npm'
  const [Mark, command] = managers[manager]
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="mt-3 flex h-10 w-fit max-w-full items-center rounded-lg border bg-muted font-mono text-sm sm:h-9">
      <Menu>
        <MenuTrigger
          className="flex h-full shrink-0 items-center gap-1.5 border-r px-3 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Package manager: ${manager}`}
        >
          <Mark className={cn('size-4', managers[manager][2])} />
          <ChevronDown className="size-3.5" />
        </MenuTrigger>
        <MenuPopup align="start">
          <MenuRadioGroup value={manager} onValueChange={(value: string) => choose(value)}>
            {(Object.keys(managers) as Manager[]).map((name) => {
              const [Icon, , color] = managers[name]
              return (
                <MenuRadioItem key={name} value={name} closeOnClick>
                  <span className="flex items-center gap-2">
                    <Icon className={cn('size-4', color)} /> {name}
                  </span>
                </MenuRadioItem>
              )
            })}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>
      <button
        type="button"
        onClick={copy}
        className="flex h-full min-w-0 items-center gap-3 px-3"
        aria-label={`Copy “${command}”`}
      >
        <span className="text-muted-foreground select-none">$</span>
        <span className="truncate text-muted-foreground">{command}</span>
        {copied ? (
          <Check className="size-4 shrink-0 text-brand-foreground" />
        ) : (
          <Copy className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
    </div>
  )
}
