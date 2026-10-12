import { Head, Link } from '@inertiajs/react'
import { href } from 'fondu/client'

const demos: Array<[url: string, title: string, text: string]> = [
  [href('/props'), 'Props', 'Values, lists, objects, lazy functions and shared props, typed by the page component.'],
  [href('/partial'), 'Partial reloads', 'Reload only some props, optional props, always props, polling and WhenVisible.'],
  [href('/deferred'), 'Deferred props', 'Props loaded after the first render, in parallel groups, with rescued failures.'],
  [href('/merging'), 'Merging props', 'Append, prepend and deep merge props across partial reloads, matching on ids.'],
  [href('/infinite'), 'Infinite scroll', 'Scroll props with pagination metadata and <InfiniteScroll>.'],
  [href('/once'), 'Once props', 'Props resolved once and remembered by the client across visits, with expiry.'],
  [href('/contacts'), 'Forms & validation', 'One schema on both sides, live validation (Precognition), error bags, flash and 303 redirects.'],
  [href('/redirects'), 'Redirects', 'Back, external redirects (409), fragment redirects and flash.'],
  [href('/versioning'), 'Asset versioning', 'A version mismatch forces a full page reload.'],
  [href('/history'), 'History encryption', 'Encrypt sensitive pages in browser history, then clear it.'],
  [href('/ssr'), 'Server-side rendering', 'Rendered on the server and hydrated, or in the browser only, per route.'],
  [href('/routes'), 'Routes & actions', 'Files in routes/ are URLs: loader, action and actions, typed href().'],
  [href('/http'), 'HTTP requests', 'useHttp against plain Hono handlers in routes/api/.'],
  [href('/navigation'), 'Navigation', 'Prefetching, view transitions, scroll and state preservation.'],
  [href('/errors'), 'Errors', '404, 403 and 500: the error page, and the development report in Inertia\'s dialog.'],
  [href('/admin/dashboard'), 'Admin', 'Admins only, a layout of its own, rendered in the browser only.'],
]

export default function Overview() {
  return (
    <>
      <Head title="Overview" />
      <h1>Inertia.js, served by Hono</h1>
      <p className="lede">
        Every page in this app is rendered by a Hono handler in <code>routes/</code> through Fondu, on Cloudflare Workers, with Better Auth and D1. Pick a demo to see a part of the protocol in action.
      </p>
      <div className="grid-cards">
        {demos.map(([url, title, text]) => (
          <Link key={url} href={url} prefetch className="card block text-ink no-underline transition-colors hover:border-accent/40">
            <h2 className="mb-1">{title}</h2>
            <p className="note">{text}</p>
          </Link>
        ))}
      </div>
    </>
  )
}
