import { Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

import { Card, CardDescription, CardHeader, CardTitle } from '#/components/ui/card.tsx'

type Demo = [url: string, title: string, text: string]

// as in the menu: Fondu's demos, then Inertia's
const groups: Array<[group: string, demos: Demo[]]> = [
  [
    'Fondu',
    [
      [
        href('/routes'),
        'Routes & actions',
        'Files in routes/ are URLs: loader, action and actions, typed href().',
      ],
      [href('/http'), 'HTTP requests', 'useHttp against plain Hono handlers in routes/api/.'],
      [
        href('/errors'),
        'Errors',
        "404, 403 and 500: the error page, and the development report in Inertia's dialog.",
      ],
      [
        href('/i18n'),
        'Languages',
        'One route file, a URL per language: [[locale]], params and Paraglide.',
      ],
      [
        href('/admin/dashboard'),
        'Admin',
        'Admins only, a layout of its own, rendered in the browser only.',
      ],
    ],
  ],
  [
    'Inertia',
    [
      [
        href('/props'),
        'Props',
        'Values, lists, objects, lazy functions and shared props, typed by the page component.',
      ],
      [
        href('/partial'),
        'Partial reloads',
        'Reload only some props, optional props, always props, polling and WhenVisible.',
      ],
      [
        href('/deferred'),
        'Deferred props',
        'Props loaded after the first render, in parallel groups, with rescued failures.',
      ],
      [
        href('/merging'),
        'Merging props',
        'Append, prepend and deep merge props across partial reloads, matching on ids.',
      ],
      [
        href('/infinite'),
        'Infinite scroll',
        'Scroll props with pagination metadata and <InfiniteScroll>.',
      ],
      [
        href('/once'),
        'Once props',
        'Props resolved once and remembered by the client across visits, with expiry.',
      ],
      [
        href('/contacts'),
        'Forms & validation',
        'One schema on both sides, live validation (Precognition), error bags, flash and 303 redirects.',
      ],
      [
        href('/redirects'),
        'Redirects',
        'Back, external redirects (409), fragment redirects and flash.',
      ],
      [href('/versioning'), 'Asset versioning', 'A version mismatch forces a full page reload.'],
      [
        href('/history'),
        'History encryption',
        'Encrypt sensitive pages in browser history, then clear it.',
      ],
      [
        href('/ssr'),
        'Server-side rendering',
        'Rendered on the server and hydrated, or in the browser only, per route.',
      ],
      [
        href('/navigation'),
        'Navigation',
        'Prefetching, view transitions, scroll and state preservation.',
      ],
    ],
  ],
]

export default function Overview() {
  return (
    <>
      <Head title="Overview" />
      <h1>Fondu demo</h1>
      <p className="lede">
        A Fondu app: each page is a route in <code>routes/</code> that renders a React page, and
        Fondu answers Inertia's protocol from Hono, on Cloudflare Workers with D1 and Better Auth.
        Each demo shows one feature, with the code that makes it work. The docs are on{' '}
        <a href="https://fondu.dev/docs">fondu.dev</a>.
      </p>
      {groups.map(([group, demos]) => (
        <section key={group} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{group}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {demos.map(([url, title, text]) => (
              <Card
                key={url}
                render={<Link href={url} prefetch />}
                className="transition-colors hover:border-foreground/16"
              >
                <CardHeader className="p-5">
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CardDescription>{text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
