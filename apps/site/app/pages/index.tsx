import { Head, Link } from '@inertiajs/react'
import { Check, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '#/components/ui/button.tsx'
import Page from '#/landing/page.mdx'
import Route from '#/landing/route.mdx'

const CREATE = 'npm create fondu@latest'

const parts: Array<[name: string, url: string, does: string]> = [
  [
    'Hono',
    'https://hono.dev',
    'The server: requests, middleware, CSRF protection, security headers. Your routes are its handlers.',
  ],
  [
    'Inertia',
    'https://inertiajs.com',
    'The browser: visits without reloads, forms, prefetching, deferred and merged props, infinite scroll.',
  ],
  ['Vite', 'https://vite.dev', 'The dev server, with updates in place, and the production build.'],
  [
    'Fondu',
    '/docs',
    'The seams: routes from files, typed pages and URLs, the server render, error pages, static pages.',
  ],
]

export default function Home() {
  return (
    <>
      <Head title="">
        <meta
          name="description"
          content="Fondu is a small meta-framework for full-stack React apps, built on Hono, Vite and Inertia. It runs on Node, Bun and Cloudflare Workers."
        />
      </Head>

      <section className="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
        <h1 className="max-w-3xl text-[2.5rem]/[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-[4rem]/[1.02]">
          Full-stack React, with no API in between.
        </h1>
        <p className="mt-6 max-w-2xl text-lg/relaxed text-muted-foreground">
          Fondu is a small meta-framework built on Hono, Vite and Inertia. A route on the server renders a React page
          with its props, and Inertia takes it from there. It runs on Node, Bun and Cloudflare Workers.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <CopyCommand />
          <Button size="lg" render={<Link href="/docs" />}>
            Read the docs
          </Button>
        </div>
      </section>

      {/* the one thing to see: a route and its page, the props passing from one to the other */}
      <section aria-label="A route and its page" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <File name="app/routes/todos.ts" note="runs on the server">
            <Route />
          </File>
          <File name="app/pages/todos.tsx" note="renders on the server, then in the browser">
            <Page />
          </File>
        </div>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          The <code>items</code> the loader passes are the props the page takes, checked by TypeScript. The form posts
          to the action and the list updates, without a fetch to write or a client router to keep in step.
        </p>
      </section>

      <section className="border-t">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[18rem_1fr]">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Who does what</h2>
            <p className="mt-3 text-muted-foreground">
              Fondu writes as little of its own as it can. The rest is three projects you may know already, and their
              docs apply as they are.
            </p>
          </div>
          <dl className="divide-y border-y">
            {parts.map(([name, url, does]) => (
              <div key={name} className="grid gap-1 py-5 sm:grid-cols-[8rem_1fr] sm:gap-6">
                <dt className="font-medium">
                  {url.startsWith('/') ? (
                    <Link href={url} className="hover:text-brand-foreground">
                      {name}
                    </Link>
                  ) : (
                    <a href={url} className="hover:text-brand-foreground">
                      {name}
                    </a>
                  )}
                </dt>
                <dd className="text-muted-foreground">{does}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-4 px-4 py-16 sm:px-6">
          <p className="mr-auto text-xl font-medium tracking-tight">Start with one route and one page.</p>
          <Button size="lg" render={<Link href="/docs/quick-start" />}>
            Quick start
          </Button>
          <Button size="lg" variant="outline" render={<a href="https://demo.fondu.dev" />}>
            See the demo
          </Button>
        </div>
      </section>
    </>
  )
}

function File({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-xl border bg-muted">
      <figcaption className="flex items-baseline justify-between gap-4 border-b px-4 py-2.5">
        <span className="font-mono text-[13px]">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{note}</span>
      </figcaption>
      <div className="[&_pre]:m-0 [&_pre]:rounded-none [&_pre]:border-0 [&_pre]:bg-background">{children}</div>
    </figure>
  )
}

function CopyCommand() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(CREATE)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="flex h-10 items-center gap-3 rounded-lg border bg-muted px-4 font-mono text-sm transition-colors hover:border-brand/60 sm:h-9"
      aria-label={`Copy “${CREATE}”`}
    >
      <span className="text-muted-foreground select-none">$</span>
      {CREATE}
      {copied ? <Check className="size-4 text-brand-foreground" /> : <Copy className="size-4 text-muted-foreground" />}
    </button>
  )
}
