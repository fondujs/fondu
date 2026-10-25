import { href } from 'fondu/client'

export type Demo = [url: string, title: string, text: string]

// The demos, grouped by what you would be doing (the menu and the overview). Which part is Fondu's or Hono's,
// each page says.
export const groups: Array<[group: string, demos: Demo[]]> = [
  [
    'Routing',
    [
      [
        href('/routes'),
        'Routes & actions',
        'Files in routes/ are URLs: loader, action and actions, typed href().',
      ],
      [href('/redirects'), 'Redirects', 'Back, to another page, to what isn’t a page (409).'],
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
        'Plain forms, validated on the server, the errors back on the page, 303 redirects.',
      ],
      [href('/uploads'), 'File uploads', 'A file in a form: checked by the schema on the server.'],
      [
        href('/flash'),
        'Flash data',
        'flash(c, …) in an action, read once by the next page: toasts and data of your own.',
      ],
      [href('/http'), 'HTTP requests', 'fetch against plain Hono handlers in routes/api/.'],
    ],
  ],
  [
    'Data loading',
    [
      [
        href('/props'),
        'Props',
        'Values, lists, objects and shared props, typed by the page component.',
      ],
    ],
  ],
  [
    'Navigation',
    [
      [
        href('/navigation'),
        'Navigation',
        'Links and forms through the Navigation API: Back at once, pending state.',
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
