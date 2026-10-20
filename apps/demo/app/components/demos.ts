import { href } from 'fondu/client'

export type Demo = [url: string, title: string, text: string]

// The demos, grouped by what you would be doing (the menu and the overview). Which part is Fondu's, Inertia's or
// Hono's, each page says.
export const groups: Array<[group: string, demos: Demo[]]> = [
  [
    'Routing',
    [
      [
        href('/routes'),
        'Routes & actions',
        'Files in routes/ are URLs: loader, action and actions, typed href().',
      ],
      [
        href('/redirects'),
        'Redirects',
        'Back, to another page, to an external URL (409), to a #fragment.',
      ],
      [
        href('/i18n'),
        'Languages',
        'One route file, a URL per language: [[locale]], params and Paraglide.',
      ],
      [
        href('/errors'),
        'Errors',
        '404, 403 and 500: the error page, the development report, a proxy’s own page.',
      ],
    ],
  ],
  [
    'Forms & requests',
    [
      [
        href('/contacts'),
        'Forms & validation',
        'One schema on both sides, live validation (Precognition), error bags, 303 redirects.',
      ],
      [
        href('/uploads'),
        'File uploads',
        'A file in a form: checked by the schema on the server, with the upload’s progress.',
      ],
      [
        href('/flash'),
        'Flash data',
        'flash(c, …) in an action, read once by the next page: toasts and data of your own.',
      ],
      [href('/http'), 'HTTP requests', 'useHttp against plain Hono handlers in routes/api/.'],
    ],
  ],
  [
    'Data loading',
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
        href('/once'),
        'Once props',
        'Props resolved once and remembered by the client across visits, with expiry.',
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
    ],
  ],
  [
    'Navigation',
    [
      [
        href('/navigation'),
        'Navigation',
        'Prefetching, view transitions, scroll and state preservation.',
      ],
      [
        href('/history'),
        'History encryption',
        'Encrypt sensitive pages in browser history, then clear it.',
      ],
      [href('/versioning'), 'Asset versioning', 'A version mismatch forces a full page reload.'],
    ],
  ],
  [
    'Rendering',
    [
      [
        href('/ssr'),
        'Server-side rendering',
        'Rendered on the server and hydrated, or in the browser only, per route.',
      ],
    ],
  ],
  [
    'Auth',
    [
      [href('/account'), 'Account', 'Better Auth’s session, a profile saved with its API.'],
      [
        href('/admin/dashboard'),
        'Admin',
        'Admins only, a layout of its own, rendered in the browser only.',
      ],
    ],
  ],
]
