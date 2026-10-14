# Contributing

Fondu is built on Hono, Vite and Inertia, and tries to write as little of its own as it can: a change that lets
the platform (Hono, Vite, Inertia, the runtime) do the work is preferred to one that adds code. For anything larger
than a fix, open an issue first to agree on the approach.

## Setup

[Bun](https://bun.sh) 1.3.14 or later (and Node 20.19 or later for the Node example).

```bash
bun install            # also builds packages/fondu, and installs the git hooks (lefthook)
bun run dev            # rebuild packages/fondu on change
bun run test           # the protocol, on a small app with app.request()
bun run check          # format (oxfmt), lint (oxlint), typecheck
```

In VS Code, the recommended extensions (`.vscode/extensions.json`: oxc, Tailwind CSS, MDX) format and fix each file as it
is saved, as the commit hook does.

`bun run --filter create-fondu test` creates an app for each target (Bun, Cloudflare Workers, Node) with `packages/fondu` as
built here, and runs it in development and production.

`apps/demo` is the end-to-end test of every feature. Start it (`bun run dev`, or `bun run preview`), then run its
checks with Chrome or Chromium:

```bash
cd apps/demo && bun run dev
CHROME_PATH=/path/to/chrome node e2e/run.mjs http://localhost:5173
```

A change to `packages/fondu` should pass both.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`,
`chore:`… The commit-msg hook checks them, and the release notes are made from them, so write them for users.

A pull request: one change, with a test (`packages/fondu/test`) or an e2e check when behavior changes, and the README
updated when the API does.

## Describing Fondu

One wording everywhere: the READMEs, both `package.json` descriptions, the GitHub description, fondu.dev and
`llms.txt`.

- The tagline: Server routes. React pages. No API in between.
- What Fondu is: A small meta-framework for full-stack React apps, built on Hono, Vite and Inertia. It runs on Bun,
  Cloudflare Workers and Node.
- What an app is: a Fondu app: full-stack React on Hono, Vite and Inertia.
- Hono, Vite and Inertia, in that order; the targets in alphabetical order (Bun, Cloudflare Workers, Node); Inertia
  without a version (the template's `AGENTS.md` names "its v3 API", for coding agents).

## Releases

Maintainers release with `bun run release` from the repository's root, on an up-to-date `main` (`git pull` first:
a release made on an old `main` is refused when it is pushed): fondu and create-fondu get the same version
(create-fondu's apps depend on `^` its own version). CI stages both on npm and a maintainer approves them (npmjs.com
→ Staged Packages, or `npm stage approve <id>`, with 2FA).

Before a release, read what npm will show and what new apps get, as it can only change with the next version:

- `README.md`: fondu's npm page (CI copies it into `packages/fondu`); its links absolute, as npm resolves relative
  ones inside the package
- `packages/create-fondu/README.md`: create-fondu's npm page
- `packages/create-fondu/template/`: the new app's `README.md` and `AGENTS.md`
- the docs (`apps/site`), for what the release changes

After it: deploy fondu.dev and the demo, and create an app on each target with the published create-fondu.
