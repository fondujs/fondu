import { Head, Link } from '@inertiajs/react'
import { Bot, Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { CodeTabs, Pre } from '#/components/code.tsx'
import { External } from '#/components/external.tsx'
import { Button } from '#/components/ui/button.tsx'
import Code from '#/landing/code.mdx'
import { PROMPT } from '#/prompt.ts'

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

      <section className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 pt-14 pb-20 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <h1 className="text-[2.5rem]/[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-[3.75rem]/[1.02]">
            <span className="block">Server routes.</span>
            <span className="block">React pages.</span>
            <span className="block">No API in between.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg/relaxed text-muted-foreground">
            Each route is a Hono handler that renders a React page with its props. Inertia swaps the pages in the
            browser, so there is no client router and no API to write. Deploy to Node, Bun or Cloudflare Workers.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link href="/docs" />}>
              Read the docs
            </Button>
            <CopyCommand />
          </div>
          <CopyPrompt />
        </div>
        {/* the one thing to see: a route and the page it renders, the props they share highlighted */}
        <div aria-label="A route and its page" role="group" className="min-w-0">
          <Code components={{ pre: Pre, CodeTabs }} />
        </div>
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
                    <External href={url} className="hover:text-brand-foreground">
                      {name}
                    </External>
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
          <Button size="lg" variant="outline" render={<External href="https://demo.fondu.dev" />}>
            See the demo
          </Button>
        </div>
      </section>
    </>
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

/** Copies the prompt that sets up Fondu with a coding agent (the quick start's "Automatic installation") */
function CopyPrompt() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(PROMPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="mt-6 flex max-w-xl items-center gap-3">
      <Button variant="outline" size="sm" onClick={copy} aria-describedby="prompt" className="shrink-0">
        {copied ? <Check className="text-brand-foreground" /> : <Bot />}
        {copied ? 'Copied' : 'Copy prompt'}
      </Button>
      <p id="prompt" className="truncate font-mono text-xs text-muted-foreground" title={PROMPT}>
        “{PROMPT}”
      </p>
    </div>
  )
}
