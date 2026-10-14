# Fondu

**A small meta-framework for full-stack React apps.** It stands on the shoulders of giants: built on Hono, Vite and
Inertia.

Routes are Hono handlers in `app/routes/`; pages are React components in `app/pages/`. A route renders a page with its
props, and Inertia does the rest in the browser: visits without full reloads, forms with validation, deferred and
merged props, all without an API to write or a client-side router to keep in sync. The same app runs on **Node, Bun and
Cloudflare Workers**.

Fondu writes as little of its own as it can: the server side of Inertia's protocol, file routes, typed pages and
URLs, the document and error pages. Everything else is Hono's, Vite's and Inertia's.

## Quick start

```bash
bun create fondu my-app      # or: npm create fondu@latest my-app · pnpm create fondu my-app
cd my-app
bun dev
```

It asks where the app runs (Node, Bun or Cloudflare Workers; or `--target node|bun|cloudflare`) and writes a small
app: a route, its page, the error page, Tailwind CSS, editor snippets and an `AGENTS.md` for coding agents.

[demo.fondu.dev](https://demo.fondu.dev) ([apps/demo](apps/demo)) shows every Inertia feature, one page each, on
Cloudflare Workers with D1 and Better Auth.

## Docs

**[fondu.dev](https://fondu.dev/docs)**: routes, pages and props, forms and validation, type safety, server-side
rendering, static pages, MDX pages, deploying, and the API. Every page is also Markdown for coding agents
([llms.txt](https://fondu.dev/llms.txt)).

## Contributing

```
packages/fondu          the package (≈1,100 lines)
packages/create-fondu   `bun create fondu`
apps/demo               every Inertia feature, one page each — Workers, D1, Better Auth, coss ui
apps/site               fondu.dev: the docs, MDX and static pages on Workers
```

```bash
bun install            # also builds packages/fondu (the examples use the built package, like a real app)
bun run test           # the protocol, on a small app with app.request()
bun run typecheck      # the package, the demo (with apps/demo/e2e/types.ts) and the site
bun run check          # format (oxfmt), lint (oxlint), typecheck
bun run dev            # rebuild packages/fondu on change
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org) (lefthook runs commitlint, and formats and
lints what is staged). A release: `bun run release` picks the version, tags it and pushes; CI publishes the tag to npm
(trusted publishing, with provenance) and writes the GitHub Release from the commits.

`apps/demo`: `cp .dev.vars.example .dev.vars`, then `bun run dev` (in workerd), `bun run preview`, `bun run deploy`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the details, and [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
