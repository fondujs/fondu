# Fondu

[![Fondu · Server routes. React pages. No API in between.](https://fondu.dev/og.png)](https://fondu.dev)

Fondu is a small meta-framework for full-stack React apps, built on Hono and Vite. It runs on Bun, Cloudflare Workers
and Node.

The files in `app/routes/` are the URLs. A page's file holds its Hono handlers, which run on the server, and its React
component, which the loader renders with props; the browser gets the component alone. Links and forms are plain `<a>`
and `<form>`: Fondu's small client swaps the pages in place, with no API to write and no client-side router to keep in
sync.

## Quick start

```bash
bun create fondu@latest my-app   # or: npm create fondu@latest my-app · pnpm create fondu@latest my-app
cd my-app
bun dev
```

It asks where the app runs (Bun, Cloudflare Workers or Node; or `--target bun|cloudflare|node`) and whether to add
code checks (oxfmt, oxlint, lefthook, commitlint; or `--checks`), and writes a small app: a route, its page, the
error page, Tailwind CSS, editor snippets and an `AGENTS.md` for coding agents. `--yes` asks nothing more.

[demo.fondu.dev](https://demo.fondu.dev) ([apps/demo](https://github.com/fondujs/fondu/tree/main/apps/demo)) shows Fondu's features, one page each,
on Cloudflare Workers with D1 and Better Auth.

## Docs

**[fondu.dev](https://fondu.dev/docs)**: routes, pages and props, layouts, forms and validation, errors, type safety,
server and client code, server-side rendering, static pages, MDX pages, internationalization, deploying, and the API.
Every page is also Markdown for coding agents ([llms.txt](https://fondu.dev/llms.txt)).

## Contributing

```
packages/fondu          the package
packages/create-fondu   `bun create fondu`
apps/demo               Fondu's features, one page each — Workers, D1, Better Auth, coss ui
apps/site               fondu.dev: the docs, MDX and static pages on Workers
apps/conformance        fondu/client against the browsers without JavaScript (Playwright: Chromium, Firefox, WebKit)
```

```bash
bun install            # also builds packages/fondu (the examples use the built package, like a real app)
bun run test           # the package: a small app with app.request(), the routes, the client
bun run typecheck      # the package, the demo (with apps/demo/e2e/types.ts), the site and apps/conformance
bun run check          # format (oxfmt), lint (oxlint), typecheck
bun run dev            # rebuild packages/fondu on change
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (lefthook runs commitlint, and formats and
lints what is staged). A release: `bun run release` picks the version, tags it and pushes; CI stages it on npm (trusted
publishing, with provenance), a maintainer approves it, and CI writes the GitHub Release from the commits.

`apps/demo`: `cp .dev.vars.example .dev.vars`, then `bun run dev` (in workerd), `bun run preview`, `bun run deploy`.

See [CONTRIBUTING.md](https://github.com/fondujs/fondu/blob/main/CONTRIBUTING.md) for the details, and [SECURITY.md](https://github.com/fondujs/fondu/blob/main/SECURITY.md) to report a
vulnerability.

## License

Distributed under the MIT License. See [LICENSE](https://github.com/fondujs/fondu/blob/main/LICENSE) for more information.
