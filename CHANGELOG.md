# Changelog

## 0.1.0

First release.

- Inertia v3 server protocol on Hono: partial reloads, optional / always / deferred (groups, rescue) / merge /
  once (ttl, fresh) / scroll props, asset versioning, error bags, flash, history encryption, fragment redirects,
  Precognition.
- `app/routes/`: `loader`, `action`, `actions` and HTTP verbs; `_middleware.ts`; `defineHandler.withValidator`.
- `app/pages/` with typed `render()` and `href()`; `pages/error.tsx`; a development error report.
- `createApp()`: CSRF, security headers, trailing slashes, error handling built in.
- Vite plugin for Node, Bun and Cloudflare Workers; SSR in the same process, `withoutSsr()` and `ssr: false`.
