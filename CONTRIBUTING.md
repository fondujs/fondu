# Contributing

Fondu is glue between Hono, Inertia and Vite, and tries to write as little of its own as it can: a change that lets
the platform (Hono, Inertia, Vite, the runtime) do the work is preferred to one that adds code. For anything larger
than a fix, open an issue first to agree on the approach.

## Setup

[Bun](https://bun.sh) 1.3.14 or later (and Node 20.19 or later for the Node example).

```bash
bun install            # also builds packages/fondu, and installs the git hooks (lefthook)
bun run dev            # rebuild packages/fondu on change
bun run test           # the protocol, on a small app with app.request()
bun run check          # format (oxfmt), lint (oxlint), typecheck
```

`bun run --filter create-fondu test` creates an app for each target (Node, Bun, Cloudflare) with `packages/fondu` as
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

## Releases

Maintainers release with `bun run release`; CI stages the version on npm and a maintainer approves it.
